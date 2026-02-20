"""
FastAPI backend for Product Image Generator.

Provides endpoints for:
- CSV validation
- Image generation with SSE progress streaming
- ZIP download of all generated images
- Shopify product push via GraphQL Admin API
"""

import asyncio
import base64
import io
import json
import logging
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("product-fairy")

import httpx
import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types

app = FastAPI(title="Product Image Generator API")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model configuration
GEMINI_MODEL = "gemini-2.5-flash-image"
GEMINI_TEXT_MODEL = "gemini-2.5-flash"

# Supported file types for store builder
SUPPORTED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"}
SUPPORTED_DOC_TYPES = {"application/pdf", "text/plain"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
MAX_FILES = 5

# Required CSV columns
REQUIRED_COLUMNS = [
    "ProductNumber",
    "GenderCode",
    "ColorCode",
    "ProductName",
    "ColorName",
    "FlatLayPrompt",
]

# In-memory storage for generated images (session-based)
generated_images: Dict[str, dict] = {}


def validate_csv_content(df: pd.DataFrame) -> dict:
    """Validate CSV DataFrame has required columns and valid data."""
    errors = []
    warnings = []

    # Check for required columns
    missing_columns = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    if missing_columns:
        errors.append(f"Missing required columns: {', '.join(missing_columns)}")
        return {"valid": False, "errors": errors, "warnings": warnings}

    # Count valid products
    valid_products = []
    for index, row in df.iterrows():
        # Check for valid product number
        product_number = row.get("ProductNumber")
        if pd.isna(product_number) or not str(product_number).startswith("CNC-P"):
            continue

        # Check for prompt
        prompt = row.get("FlatLayPrompt")
        if pd.isna(prompt) or not str(prompt).strip():
            warnings.append(f"Row {index + 1}: Missing FlatLayPrompt for {product_number}")
            continue

        valid_products.append({
            "product_number": str(row["ProductNumber"]).strip(),
            "gender_code": str(row.get("GenderCode", "U")).strip(),
            "color_code": str(row.get("ColorCode", "")).strip(),
            "product_name": str(row.get("ProductName", "")).strip(),
            "color_name": str(row.get("ColorName", "")).strip(),
            "prompt": str(row["FlatLayPrompt"]).strip(),
        })

    if not valid_products:
        errors.append("No valid products found. ProductNumber must start with 'CNC-P' and have a FlatLayPrompt.")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "product_count": len(valid_products),
        "products": valid_products,
    }


@app.post("/api/validate-csv")
async def validate_csv(file: UploadFile = File(...)):
    """Validate uploaded CSV file format and content."""
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    validation = validate_csv_content(df)

    # Add preview of first few rows
    preview_rows = []
    if validation["valid"] and validation["products"]:
        for product in validation["products"][:3]:
            preview_rows.append({
                "productNumber": product["product_number"],
                "productName": product["product_name"],
                "genderCode": product["gender_code"],
                "colorName": product["color_name"],
            })

    return {
        "valid": validation["valid"],
        "errors": validation["errors"],
        "warnings": validation["warnings"],
        "rowCount": validation.get("product_count", 0),
        "preview": preview_rows,
    }


def create_filename(product_number: str, gender_code: str, color_code: str) -> str:
    """Create filename from ProductNumber + GenderCode + ColorCode, removing dashes."""
    clean_product_number = product_number.replace("-", "")
    return f"{clean_product_number}{gender_code}{color_code}"


def convert_png_to_jpg(png_data: bytes) -> Optional[bytes]:
    """Convert PNG bytes to JPG using ffmpeg."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as png_file:
            png_file.write(png_data)
            png_path = png_file.name

        jpg_path = png_path.replace(".png", ".jpg")

        subprocess.run(
            ["ffmpeg", "-i", png_path, "-q:v", "2", "-y", jpg_path],
            capture_output=True,
            check=True,
        )

        with open(jpg_path, "rb") as f:
            jpg_data = f.read()

        # Cleanup temp files
        Path(png_path).unlink(missing_ok=True)
        Path(jpg_path).unlink(missing_ok=True)

        return jpg_data
    except Exception:
        return None


async def generate_single_image(
    client: genai.Client,
    prompt: str,
    max_retries: int = 3,
) -> tuple[Optional[bytes], Optional[str]]:
    """Generate a single product image.

    Returns (image_bytes, mime_type, None) on success, or (None, None, error_message) on failure.
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            contents = [
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)],
                ),
            ]

            generate_content_config = types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            )

            # Run in executor since the SDK is synchronous
            loop = asyncio.get_event_loop()
            response_chunks = await loop.run_in_executor(
                None,
                lambda: list(client.models.generate_content_stream(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=generate_content_config,
                ))
            )

            # Process response chunks
            for chunk in response_chunks:
                if (
                    chunk.candidates is None
                    or chunk.candidates[0].content is None
                    or chunk.candidates[0].content.parts is None
                ):
                    continue

                part = chunk.candidates[0].content.parts[0]
                if part.inline_data and part.inline_data.data:
                    png_data = part.inline_data.data
                    jpg_data = convert_png_to_jpg(png_data)
                    if jpg_data:
                        return jpg_data, "image/jpeg", None
                    # If conversion failed, return PNG
                    return png_data, "image/png", None

            # Stream completed but no image data was found
            last_error = "No image data in API response"

        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 2
                await asyncio.sleep(wait_time)
            continue

    return None, None, last_error


async def generate_single_image_with_reference(
    client: genai.Client,
    prompt: str,
    reference_image: Optional[bytes] = None,
    reference_mime_type: str = "image/jpeg",
    max_retries: int = 3,
) -> tuple[Optional[bytes], Optional[str], Optional[str]]:
    """Generate an image, optionally using a reference image for color consistency.

    Returns (image_bytes, mime_type, None) on success, or (None, None, error_message) on failure.
    """
    last_error = None
    for attempt in range(max_retries):
        try:
            parts = []
            if reference_image:
                parts.append(types.Part.from_bytes(data=reference_image, mime_type=reference_mime_type))
            parts.append(types.Part.from_text(text=prompt))

            contents = [types.Content(role="user", parts=parts)]
            generate_content_config = types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            )

            loop = asyncio.get_event_loop()
            response_chunks = await loop.run_in_executor(
                None,
                lambda: list(client.models.generate_content_stream(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=generate_content_config,
                ))
            )

            for chunk in response_chunks:
                if (
                    chunk.candidates is None
                    or chunk.candidates[0].content is None
                    or chunk.candidates[0].content.parts is None
                ):
                    continue
                part = chunk.candidates[0].content.parts[0]
                if part.inline_data and part.inline_data.data:
                    png_data = part.inline_data.data
                    jpg_data = convert_png_to_jpg(png_data)
                    if jpg_data:
                        return jpg_data, "image/jpeg", None
                    return png_data, "image/png", None

            last_error = "No image data in API response"
        except Exception as e:
            last_error = str(e)
            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 2
                await asyncio.sleep(wait_time)
            continue

    return None, None, last_error


def group_products_by_number(products: List[dict]) -> List[List[dict]]:
    """Group products by product_number, preserving insertion order."""
    from collections import OrderedDict
    groups: OrderedDict[str, List[dict]] = OrderedDict()
    for p in products:
        key = p["product_number"]
        groups.setdefault(key, []).append(p)
    return list(groups.values())


async def generate_images_stream(api_key: str, products: List[dict]):
    """Generator that yields SSE events for image generation progress.

    Groups products by product_number for color consistency: the first color
    variant generates normally and becomes the reference image, subsequent
    variants of the same product receive the reference image so Gemini can
    recreate the same product in a different color.
    """
    global generated_images
    generated_images.clear()

    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to initialize API: {str(e)}'})}\n\n"
        return

    total = len(products)
    groups = group_products_by_number(products)

    counter = 0
    for group in groups:
        reference_image_bytes: Optional[bytes] = None
        reference_mime: str = "image/jpeg"

        for j, product in enumerate(group):
            counter += 1
            filename = create_filename(
                product["product_number"],
                product["gender_code"],
                product["color_code"],
            )

            yield f"data: {json.dumps({'type': 'progress', 'current': counter, 'total': total, 'product': product['product_name'], 'filename': filename})}\n\n"

            # First in group: generate normally. Subsequent: use reference image.
            is_variant = j > 0 and reference_image_bytes is not None
            prompt = product["prompt"]

            if is_variant:
                # Shorter prompt focused on color change
                color_name = product.get("color_name", "")
                prompt = f"{prompt}. Generate the exact same product design but in {color_name} color."
                image_data, mime_type, gen_error = await generate_single_image_with_reference(
                    client, prompt, reference_image_bytes, reference_mime
                )
            else:
                image_data, mime_type, gen_error = await generate_single_image(client, prompt)

            if image_data:
                # Store the first successful image as reference for the group
                if j == 0:
                    reference_image_bytes = image_data
                    reference_mime = mime_type or "image/jpeg"

                image_b64 = base64.b64encode(image_data).decode("utf-8")
                generated_images[filename] = {
                    "data": image_b64,
                    "product_name": product["product_name"],
                    "color_name": product["color_name"],
                    "filename": filename,
                }

                yield f"data: {json.dumps({'type': 'image', 'filename': filename, 'productName': product['product_name'], 'colorName': product['color_name'], 'productNumber': product['product_number'], 'genderCode': product['gender_code'], 'colorCode': product['color_code'], 'prompt': product['prompt'], 'data': image_b64})}\n\n"
            else:
                error_detail = f"Failed to generate image for {filename}: {gen_error}" if gen_error else f"Failed to generate image for {filename}"
                yield f"data: {json.dumps({'type': 'error', 'message': error_detail})}\n\n"

            if counter < total:
                await asyncio.sleep(1)

    yield f"data: {json.dumps({'type': 'complete', 'total': len(generated_images)})}\n\n"


@app.post("/api/generate")
async def generate_images(
    api_key: str = Form(...),
    file: UploadFile = File(...),
):
    """Generate images from CSV with SSE progress streaming."""
    # Parse CSV
    try:
        contents = await file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    # Validate and extract products
    validation = validate_csv_content(df)
    if not validation["valid"]:
        raise HTTPException(status_code=400, detail=validation["errors"][0])

    products = validation["products"]

    return StreamingResponse(
        generate_images_stream(api_key, products),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/download-all")
async def download_all():
    """Download all generated images as a ZIP file."""
    if not generated_images:
        raise HTTPException(status_code=404, detail="No images to download")

    # Create ZIP in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for filename, image_info in generated_images.items():
            image_data = base64.b64decode(image_info["data"])
            zip_file.writestr(f"{filename}.jpg", image_data)

    zip_buffer.seek(0)

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=generated_images.zip"
        },
    )


@app.get("/api/download/{filename}")
async def download_single(filename: str):
    """Download a single generated image."""
    if filename not in generated_images:
        raise HTTPException(status_code=404, detail="Image not found")

    image_data = base64.b64decode(generated_images[filename]["data"])

    return StreamingResponse(
        io.BytesIO(image_data),
        media_type="image/jpeg",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.jpg"
        },
    )


# Store Builder endpoints


def get_store_generation_prompt(description: str, product_count: int) -> str:
    """Build the Gemini prompt for store generation."""
    return f"""You are a creative brand strategist and product designer. Based on the following store description, create a complete brand concept and product catalog.

STORE DESCRIPTION:
{description}

REQUIREMENTS:
1. Create a brand with:
   - name: A unique, memorable brand name
   - tagline: A catchy slogan (max 10 words)
   - description: Brief brand story (2-3 sentences)
   - style: Visual style keywords for image generation (e.g., "minimalist, earth tones, natural textures")

2. Generate exactly {product_count} unique product designs. For each design, create 2-3 color variants.
   All color variants of the same product MUST share the same ProductNumber and ProductName, but differ in ColorCode, ColorName, and FlatLayPrompt.

   Each product variant row must have:
   - ProductNumber: Format "CNC-P001", "CNC-P002", etc. Same number for all color variants of the same product.
   - ProductName: Descriptive product name. Same for all color variants of the same product.
   - GenderCode: "M" (Men), "W" (Women), or "U" (Unisex)
   - ColorCode: 2-3 letter uppercase code (e.g., "BLK", "WHT", "NVY")
   - ColorName: Full color name (e.g., "Black", "White", "Navy Blue")
   - ProductType: A Shopify product category (e.g., "T-Shirt", "Pants", "Jacket", "Hoodie", "Sneakers"). Same for all variants of the same product.
   - Description: A compelling Shopify product description (2-3 sentences). Highlight materials, features, and appeal. Write in a brand-appropriate tone.
   - Price: A realistic retail price as a number (no currency symbol), e.g. "49.99"
   - Inventory: A random whole number between 1 and 100 representing stock quantity, e.g. "42". Each variant should have a different random value.
   - FlatLayPrompt: Detailed image generation prompt for a flat-lay product photo. Include:
     * The exact product type and style
     * Color and material details
     * Background and lighting style (consistent with brand)
     * Any props or styling elements
     * Should specify "flat-lay product photography" style

IMPORTANT: The FlatLayPrompt should be detailed enough to generate a professional product image. Make all products cohesive with the brand style.

Respond with valid JSON only, no markdown formatting:
{{
  "brand": {{
    "name": "...",
    "tagline": "...",
    "description": "...",
    "style": "..."
  }},
  "products": [
    {{
      "ProductNumber": "CNC-P001",
      "ProductName": "...",
      "GenderCode": "...",
      "ColorCode": "BLK",
      "ColorName": "Black",
      "ProductType": "...",
      "Description": "...",
      "Price": "49.99",
      "Inventory": "42",
      "FlatLayPrompt": "..."
    }},
    {{
      "ProductNumber": "CNC-P001",
      "ProductName": "...",
      "GenderCode": "...",
      "ColorCode": "NVY",
      "ColorName": "Navy Blue",
      "ProductType": "...",
      "Description": "...",
      "Price": "49.99",
      "Inventory": "67",
      "FlatLayPrompt": "..."
    }}
  ]
}}"""


async def process_uploaded_files(files: List[UploadFile]) -> List[types.Part]:
    """Process uploaded files into Gemini-compatible parts."""
    parts = []

    for file in files[:MAX_FILES]:
        if not file.filename:
            continue

        content = await file.read()

        # Check file size
        if len(content) > MAX_FILE_SIZE:
            continue

        content_type = file.content_type or ""

        if content_type in SUPPORTED_IMAGE_TYPES:
            # Image file - include as inline data
            parts.append(types.Part.from_bytes(data=content, mime_type=content_type))
        elif content_type == "application/pdf":
            # PDF - include as document
            parts.append(types.Part.from_bytes(data=content, mime_type="application/pdf"))
        elif content_type == "text/plain" or file.filename.endswith(".txt"):
            # Text file - include as text
            try:
                text_content = content.decode("utf-8")
                parts.append(types.Part.from_text(text=f"Reference document ({file.filename}):\n{text_content}"))
            except UnicodeDecodeError:
                continue

    return parts


async def generate_store_stream(
    api_key: str,
    description: str,
    product_count: int,
    file_parts: List[types.Part],
):
    """Generator that yields SSE events for store generation progress."""
    # Initialize Gemini client
    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to initialize API: {str(e)}'})}\n\n"
        return

    # Stage 1: Analyzing
    yield f"data: {json.dumps({'type': 'progress', 'stage': 'analyzing', 'message': 'Analyzing your store description...'})}\n\n"

    # Build prompt
    prompt_text = get_store_generation_prompt(description, product_count)

    # Create content parts
    content_parts = [types.Part.from_text(text=prompt_text)]

    # Add file parts if any
    if file_parts:
        yield f"data: {json.dumps({'type': 'progress', 'stage': 'analyzing', 'message': f'Processing {len(file_parts)} reference file(s)...'})}\n\n"
        content_parts.extend(file_parts)

    # Stage 2: Generating
    yield f"data: {json.dumps({'type': 'progress', 'stage': 'generating', 'message': 'Creating brand concept and product catalog...'})}\n\n"

    try:
        # Generate store concept
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(
                model=GEMINI_TEXT_MODEL,
                contents=[
                    types.Content(
                        role="user",
                        parts=content_parts,
                    ),
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
        )

        # Parse response
        response_text = response.text.strip()

        # Try to parse JSON
        try:
            store_data = json.loads(response_text)
        except json.JSONDecodeError:
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\{[\s\S]*\}', response_text)
            if json_match:
                store_data = json.loads(json_match.group())
            else:
                raise ValueError("Could not parse response as JSON")

        # Validate structure
        if "brand" not in store_data or "products" not in store_data:
            raise ValueError("Response missing required 'brand' or 'products' fields")

        # Send brand data
        yield f"data: {json.dumps({'type': 'brand', 'data': store_data['brand']})}\n\n"

        # Small delay for UX
        await asyncio.sleep(0.5)

        # Send products data
        yield f"data: {json.dumps({'type': 'products', 'data': store_data['products']})}\n\n"

        # Complete
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to generate store: {str(e)}'})}\n\n"


@app.post("/api/generate-store")
async def generate_store(
    api_key: str = Form(...),
    description: str = Form(...),
    product_count: int = Form(default=10),
    files: List[UploadFile] = File(default=[]),
):
    """Generate brand concept and product catalog from store description."""
    # Validate product count
    if product_count < 5 or product_count > 100:
        raise HTTPException(status_code=400, detail="Product count must be between 5 and 100")

    # Validate description
    if not description.strip():
        raise HTTPException(status_code=400, detail="Store description is required")

    # Process uploaded files
    file_parts = await process_uploaded_files(files)

    return StreamingResponse(
        generate_store_stream(api_key, description, product_count, file_parts),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class ProductsRequest(BaseModel):
    """Request model for generate-from-products endpoint."""
    api_key: str
    products: List[Dict[str, Any]]
    photo_style: str = "professional product photography, clean white background, soft shadows"


def build_product_prompt(product: dict, photo_style: str) -> str:
    """Build a complete prompt for image generation by combining product details with photo style."""
    # Get gender description
    gender_map = {"M": "men's", "W": "women's", "U": "unisex"}
    gender = gender_map.get(product.get("gender_code", "U"), "")

    # Build product description
    product_name = product.get("product_name", "product")
    color_name = product.get("color_name", "")

    # Combine into full prompt
    if color_name:
        product_desc = f"{color_name} {gender} {product_name}".strip()
    else:
        product_desc = f"{gender} {product_name}".strip()

    return f"{photo_style}, {product_desc}"


@app.post("/api/generate-from-products")
async def generate_from_products(request: ProductsRequest):
    """Generate images directly from a products array."""
    # Validate products
    if not request.products:
        raise HTTPException(status_code=400, detail="Products array is required")

    if not request.photo_style.strip():
        raise HTTPException(status_code=400, detail="Photo style is required")

    # Transform products to internal format with generated prompts
    products = []
    for p in request.products:
        product_data = {
            "product_number": str(p.get("ProductNumber", "")).strip(),
            "gender_code": str(p.get("GenderCode", "U")).strip(),
            "color_code": str(p.get("ColorCode", "")).strip(),
            "product_name": str(p.get("ProductName", "")).strip(),
            "color_name": str(p.get("ColorName", "")).strip(),
        }
        # Build prompt from photo style + product details
        product_data["prompt"] = build_product_prompt(product_data, request.photo_style)
        products.append(product_data)

    # Filter out products without valid data (need at least product number and name)
    valid_products = [
        p for p in products
        if p["product_number"] and p["product_name"]
    ]

    if not valid_products:
        raise HTTPException(status_code=400, detail="No valid products found")

    return StreamingResponse(
        generate_images_stream(request.api_key, valid_products),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class RegenerateSingleRequest(BaseModel):
    """Request model for single-image regeneration."""
    api_key: str
    product_number: str
    product_name: str
    gender_code: str = "U"
    color_code: str = ""
    color_name: str = ""
    prompt: str


@app.post("/api/regenerate-single")
async def regenerate_single(request: RegenerateSingleRequest):
    """Regenerate a single product image and return JSON."""
    if not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt is required")

    try:
        client = genai.Client(api_key=request.api_key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to initialize API: {str(e)}")

    image_data, _, gen_error = await generate_single_image(client, request.prompt)

    if not image_data:
        raise HTTPException(status_code=500, detail=gen_error or "Failed to generate image")

    filename = create_filename(request.product_number, request.gender_code, request.color_code)
    image_b64 = base64.b64encode(image_data).decode("utf-8")

    # Update in-memory storage
    generated_images[filename] = {
        "data": image_b64,
        "product_name": request.product_name,
        "color_name": request.color_name,
        "filename": filename,
    }

    return {
        "filename": filename,
        "productName": request.product_name,
        "colorName": request.color_name,
        "prompt": request.prompt,
        "data": image_b64,
    }


# ---------------------------------------------------------------------------
# Shopify Push endpoint
# ---------------------------------------------------------------------------

SHOPIFY_API_VERSION = "2025-01"


class ShopifyValidateRequest(BaseModel):
    """Request model for validating Shopify credentials."""
    store_url: str
    client_id: str
    client_secret: str


async def exchange_shopify_credentials(
    client: httpx.AsyncClient,
    store_url: str,
    client_id: str,
    client_secret: str,
) -> str:
    """Exchange client credentials for a Shopify access token (OAuth 2.0 client_credentials grant)."""
    resp = await client.post(
        f"https://{store_url}/admin/oauth/access_token",
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


@app.post("/api/validate-shopify")
async def validate_shopify(request: ShopifyValidateRequest):
    """Validate Shopify credentials by exchanging them for a token and querying the shop."""
    store_url = request.store_url.strip().lower()
    store_url = store_url.removeprefix("https://").removeprefix("http://").rstrip("/")

    if not store_url or not request.client_id.strip() or not request.client_secret.strip():
        raise HTTPException(status_code=400, detail="Store URL, Client ID, and Client Secret are required")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Exchange client credentials for an access token
            access_token = await exchange_shopify_credentials(
                client, store_url, request.client_id.strip(), request.client_secret.strip(),
            )
            # Verify the token works by querying the shop
            result = await shopify_graphql(
                client, store_url, access_token,
                "{ shop { name } }",
            )
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Invalid credentials. Check your Client ID and Client Secret, and ensure the app has write_products scope.",
            )
        raise HTTPException(
            status_code=400,
            detail=f"Connection failed (HTTP {e.response.status_code}). Check your store URL.",
        )
    except httpx.ConnectError:
        raise HTTPException(status_code=400, detail="Could not reach store. Check the URL.")
    except KeyError:
        raise HTTPException(status_code=401, detail="Token exchange failed. Check your Client ID and Client Secret.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {str(e)}")

    errors = result.get("errors")
    if errors:
        raise HTTPException(status_code=400, detail=errors[0].get("message", "GraphQL error"))

    shop_name = result.get("data", {}).get("shop", {}).get("name", "")
    return {"ok": True, "shop_name": shop_name, "store_url": store_url}


class ShopifyPushRequest(BaseModel):
    """Request model for pushing products to Shopify."""
    store_url: str
    client_id: str
    client_secret: str
    products: List[Dict[str, Any]]
    brand: Optional[Dict[str, Any]] = None
    images: Dict[str, str]  # filename -> base64 image data
    location_id: Optional[str] = None  # Shopify location ID (numeric) for inventory


async def shopify_graphql(
    client: httpx.AsyncClient,
    store_url: str,
    access_token: str,
    query: str,
    variables: Optional[dict] = None,
) -> dict:
    """Execute a Shopify GraphQL Admin API request."""
    url = f"https://{store_url}/admin/api/{SHOPIFY_API_VERSION}/graphql.json"
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    resp = await client.post(
        url,
        json=payload,
        headers={
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        },
    )
    resp.raise_for_status()
    return resp.json()


async def shopify_staged_upload(
    client: httpx.AsyncClient,
    store_url: str,
    access_token: str,
    filename: str,
    mime_type: str,
    file_size: int,
) -> dict:
    """Create a staged upload target for an image."""
    query = """
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
    """
    variables = {
        "input": [
            {
                "filename": filename,
                "mimeType": mime_type,
                "resource": "IMAGE",
                "fileSize": str(file_size),
                "httpMethod": "POST",
            }
        ]
    }

    result = await shopify_graphql(client, store_url, access_token, query, variables)
    data = result.get("data", {}).get("stagedUploadsCreate", {})

    if data.get("userErrors"):
        raise ValueError(f"Staged upload error: {data['userErrors'][0]['message']}")

    targets = data.get("stagedTargets", [])
    if not targets:
        raise ValueError("No staged upload target returned")

    return targets[0]


async def upload_image_to_staged_target(
    client: httpx.AsyncClient,
    target: dict,
    image_data: bytes,
    mime_type: str,
    filename: str,
) -> str:
    """Upload image binary to the staged target URL. Returns the resourceUrl."""
    # Build multipart form data from parameters
    form_data = {}
    for param in target["parameters"]:
        form_data[param["name"]] = param["value"]

    # Upload the file
    files = {"file": (filename, image_data, mime_type)}
    resp = await client.post(target["url"], data=form_data, files=files)
    resp.raise_for_status()

    return target["resourceUrl"]


async def create_shopify_product(
    client: httpx.AsyncClient,
    store_url: str,
    access_token: str,
    title: str,
    description_html: str,
    vendor: str,
    product_type: str,
    variants_data: List[dict],
    media_urls: List[dict],
) -> dict:
    """Create a product with variants and media using the productSet mutation.

    The productSet mutation (unlike productCreate) supports variants, options,
    and file attachments in a single ProductSetInput.
    """
    query = """
    mutation productSet($input: ProductSetInput!, $synchronous: Boolean!) {
      productSet(input: $input, synchronous: $synchronous) {
        product {
          id
          title
          handle
          variants(first: 50) {
            nodes {
              id
              title
              sku
              inventoryItem {
                id
              }
            }
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
    """

    # Build variant inputs
    variant_inputs = []
    for v in variants_data:
        variant_input = {
            "optionValues": [{"optionName": "Color", "name": v["color_name"]}],
            "price": str(v.get("price", "0.00")),
            "sku": v.get("sku", ""),
            "inventoryItem": {"tracked": True},
        }
        variant_inputs.append(variant_input)

    # Build file inputs from staged upload resource URLs
    file_inputs = []
    for m in media_urls:
        file_inputs.append({
            "originalSource": m["resource_url"],
            "contentType": "IMAGE",
            "alt": m.get("alt", ""),
        })

    product_input = {
        "title": title,
        "descriptionHtml": description_html,
        "vendor": vendor,
        "productType": product_type,
        "status": "ACTIVE",
        "productOptions": [
            {
                "name": "Color",
                "values": [{"name": v["color_name"]} for v in variants_data],
            }
        ],
        "variants": variant_inputs,
    }

    if file_inputs:
        product_input["files"] = file_inputs

    variables = {"input": product_input, "synchronous": True}

    logger.warning("[shopify] productSet variables: %s", json.dumps(variables, default=str)[:500])
    result = await shopify_graphql(client, store_url, access_token, query, variables)
    logger.warning("[shopify] productSet response: %s", json.dumps(result, default=str)[:1000])

    # Check for top-level GraphQL errors (schema validation failures, etc.)
    if result.get("errors"):
        error_msgs = "; ".join(e.get("message", "Unknown error") for e in result["errors"])
        raise ValueError(f"GraphQL error: {error_msgs}")

    data = result.get("data") or {}
    payload = data.get("productSet") or {}

    if payload.get("userErrors"):
        errors = "; ".join(e["message"] for e in payload["userErrors"])
        raise ValueError(f"Product creation error: {errors}")

    product = payload.get("product")
    if not product:
        raise ValueError("Product creation returned null — check API version and mutation input")

    return product


async def activate_inventory_at_location(
    client: httpx.AsyncClient,
    store_url: str,
    access_token: str,
    inventory_item_id: str,
    location_id: str,
    quantity: int,
) -> None:
    """Activate an inventory item at a location, then set the available quantity."""
    # Step 1: Activate (stock) the inventory item at this location
    activate_query = """
    mutation inventoryActivate($inventoryItemId: ID!, $locationId: ID!) {
      inventoryActivate(inventoryItemId: $inventoryItemId, locationId: $locationId) {
        inventoryLevel { id }
        userErrors { field message }
      }
    }
    """
    result = await shopify_graphql(
        client, store_url, access_token, activate_query,
        {"inventoryItemId": inventory_item_id, "locationId": location_id},
    )
    logger.warning("[shopify] inventoryActivate response: %s", json.dumps(result, default=str)[:500])
    activate_data = (result.get("data") or {}).get("inventoryActivate") or {}
    if activate_data.get("userErrors"):
        logger.warning("[shopify] inventoryActivate userErrors (non-fatal): %s", activate_data["userErrors"])

    # Step 2: Set the available quantity
    if quantity > 0:
        set_query = """
        mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup { createdAt }
            userErrors { field message }
          }
        }
        """
        set_vars = {
            "input": {
                "reason": "correction",
                "name": "available",
                "ignoreCompareQuantity": True,
                "quantities": [
                    {
                        "inventoryItemId": inventory_item_id,
                        "locationId": location_id,
                        "quantity": quantity,
                    }
                ],
            }
        }
        result = await shopify_graphql(client, store_url, access_token, set_query, set_vars)
        logger.warning("[shopify] inventorySetQuantities response: %s", json.dumps(result, default=str)[:500])
        set_data = (result.get("data") or {}).get("inventorySetQuantities") or {}
        if set_data.get("userErrors"):
            logger.warning("[shopify] inventorySetQuantities userErrors: %s", set_data["userErrors"])
        else:
            logger.warning("[shopify] Inventory set: item=%s, location=%s, qty=%d", inventory_item_id, location_id, quantity)


async def publish_product(
    client: httpx.AsyncClient,
    store_url: str,
    access_token: str,
    product_gid: str,
) -> None:
    """Publish a product to the online store sales channel."""
    # First, get the publication ID for the online store
    pub_query = """
    {
      publications(first: 10) {
        nodes {
          id
          name
          supportsFuturePublishing
        }
      }
    }
    """
    pub_result = await shopify_graphql(client, store_url, access_token, pub_query)
    publications = pub_result.get("data", {}).get("publications", {}).get("nodes", [])

    online_store_pub = None
    for pub in publications:
        if "online store" in pub.get("name", "").lower():
            online_store_pub = pub["id"]
            break

    if not online_store_pub and publications:
        # Fall back to first publication
        online_store_pub = publications[0]["id"]

    if not online_store_pub:
        return  # No publications available

    query = """
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }
    """
    variables = {
        "id": product_gid,
        "input": [{"publicationId": online_store_pub}],
    }
    await shopify_graphql(client, store_url, access_token, query, variables)


async def push_to_shopify_stream(request: ShopifyPushRequest):
    """Generator that yields SSE events for Shopify push progress."""
    logger.warning("[shopify-push] Stream started. store_url=%s, products=%d, images=%d", request.store_url, len(request.products), len(request.images))

    store_url = request.store_url.strip()
    products = request.products
    brand = request.brand or {}
    images_map = request.images  # filename -> base64

    # Group products by ProductNumber
    from collections import OrderedDict
    groups: OrderedDict[str, List[dict]] = OrderedDict()
    for p in products:
        key = p.get("ProductNumber", "")
        if key:
            groups.setdefault(key, []).append(p)

    total_groups = len(groups)
    logger.warning("[shopify-push] Grouped into %d product groups", total_groups)
    if total_groups == 0:
        yield f"data: {json.dumps({'type': 'error', 'message': 'No valid products to push'})}\n\n"
        return

    yield f"data: {json.dumps({'type': 'progress', 'current': 0, 'total': total_groups, 'message': 'Connecting to Shopify...'})}\n\n"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # Exchange client credentials for an access token
            try:
                logger.warning("[shopify-push] Exchanging credentials for %s...", store_url)
                access_token = await exchange_shopify_credentials(
                    client, store_url, request.client_id.strip(), request.client_secret.strip(),
                )
                logger.warning("[shopify-push] Token obtained (length=%d)", len(access_token))
            except Exception as e:
                logger.warning("[shopify-push] Auth failed: %s", e)
                yield f"data: {json.dumps({'type': 'error', 'message': f'Authentication failed: {str(e)}'})}\n\n"
                return

            # Query the store's primary location (required for setting inventory)
            location_id = None
            try:
                loc_result = await shopify_graphql(
                    client, store_url, access_token,
                    "{ locations(first: 5) { nodes { id name isActive } } }",
                )
                locations = (loc_result.get("data") or {}).get("locations", {}).get("nodes", [])
                if locations:
                    location_id = locations[0]["id"]
                    logger.warning("[shopify-push] Using location: %s (%s)", locations[0].get("name"), location_id)
                else:
                    # Query was denied or returned empty — fall back to getting location
                    # from an inventory item on an existing product
                    logger.warning("[shopify-push] Locations query returned no data (likely ACCESS_DENIED), trying fallback...")
                    fallback_result = await shopify_graphql(
                        client, store_url, access_token,
                        "{ shop { id name } }",
                    )
                    logger.warning("[shopify-push] Shop query: %s", json.dumps(fallback_result, default=str)[:300])
            except Exception as e:
                logger.warning("[shopify-push] Could not fetch locations: %s", e)

            # If we still don't have a location, try to get it from the first created product's inventory
            # by creating a temporary product, reading its inventory level, then deleting it.
            # For now, use a provided location_id if available in the request.
            if not location_id and hasattr(request, 'location_id') and request.location_id:
                location_id = f"gid://shopify/Location/{request.location_id}"
                logger.warning("[shopify-push] Using provided location_id: %s", location_id)

            created_count = 0

            for idx, (product_number, variants) in enumerate(groups.items()):
                first = variants[0]
                title = first.get("ProductName", "Untitled")

                yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total_groups, 'message': f'Creating {title}... Uploading images...'})}\n\n"

                # Upload images for all variants via staged uploads
                media_urls = []
                for variant in variants:
                    pn = str(variant.get("ProductNumber", "")).replace("-", "")
                    gc = variant.get("GenderCode", "U")
                    cc = variant.get("ColorCode", "")
                    filename = f"{pn}{gc}{cc}"

                    image_b64 = images_map.get(filename)
                    if not image_b64:
                        logger.warning("[shopify-push] No image for %s, skipping", filename)
                        yield f"data: {json.dumps({'type': 'error', 'message': f'No image found for variant {filename}, skipping image.'})}\n\n"
                        continue

                    try:
                        image_bytes = base64.b64decode(image_b64)
                        mime_type = "image/jpeg"
                        upload_filename = f"{filename}.jpg"

                        logger.warning("[shopify-push] Staging upload for %s (%d bytes)", upload_filename, len(image_bytes))
                        target = await shopify_staged_upload(
                            client, store_url, access_token,
                            upload_filename, mime_type, len(image_bytes),
                        )

                        resource_url = await upload_image_to_staged_target(
                            client, target, image_bytes, mime_type, upload_filename,
                        )
                        logger.warning("[shopify-push] Image uploaded: %s", resource_url[:80])

                        media_urls.append({
                            "resource_url": resource_url,
                            "alt": f"{variant.get('ProductName', '')} - {variant.get('ColorName', '')}",
                        })
                    except Exception as e:
                        logger.warning("[shopify-push] Image upload failed for %s: %s", filename, e)
                        yield f"data: {json.dumps({'type': 'error', 'message': f'Image upload failed for {filename}: {str(e)}'})}\n\n"

                # Build variant data
                variants_data = []
                for variant in variants:
                    sku = f"{variant.get('ProductNumber', '')}-{variant.get('ColorCode', 'DEF')}"
                    inventory = int(variant.get("Inventory", 0)) if str(variant.get("Inventory", "")).strip() else 0
                    variants_data.append({
                        "color_name": variant.get("ColorName", "Default"),
                        "price": str(variant.get("Price", "0.00")),
                        "sku": sku,
                        "inventory": inventory,
                    })

                # Create the product
                try:
                    yield f"data: {json.dumps({'type': 'progress', 'current': idx + 1, 'total': total_groups, 'message': f'Creating {title}...'})}\n\n"

                    description = first.get("Description", "")
                    description_html = f"<p>{description}</p>" if description else ""
                    product_type = first.get("ProductType", "")

                    logger.warning("[shopify-push] Creating product '%s' with %d variants, %d images", title, len(variants_data), len(media_urls))
                    product = await create_shopify_product(
                        client, store_url, access_token,
                        title=title,
                        description_html=description_html,
                        vendor=brand.get("name", ""),
                        product_type=product_type,
                        variants_data=variants_data,
                        media_urls=media_urls,
                    )
                    logger.warning("[shopify-push] Product created: id=%s, handle=%s", product.get("id"), product.get("handle"))

                    # Activate inventory at the location for each variant
                    if location_id:
                        created_variants = (product.get("variants") or {}).get("nodes") or []
                        for vi, cv in enumerate(created_variants):
                            inv_item_id = (cv.get("inventoryItem") or {}).get("id")
                            qty = variants_data[vi]["inventory"] if vi < len(variants_data) else 0
                            if inv_item_id:
                                try:
                                    await activate_inventory_at_location(
                                        client, store_url, access_token,
                                        inv_item_id, location_id, qty,
                                    )
                                except Exception as inv_err:
                                    logger.warning("[shopify-push] Inventory activation failed for %s: %s", cv.get("sku"), inv_err)

                    product_gid = product.get("id")
                    if product_gid:
                        try:
                            await publish_product(client, store_url, access_token, product_gid)
                            logger.warning("[shopify-push] Published %s", product_gid)
                        except Exception as pub_err:
                            logger.warning("[shopify-push] Publish failed (non-fatal): %s", pub_err)

                    created_count += 1
                    yield f"data: {json.dumps({'type': 'product_created', 'title': title, 'handle': product.get('handle', ''), 'current': idx + 1, 'total': total_groups})}\n\n"

                except Exception as e:
                    logger.warning("[shopify-push] Failed to create %s: %s", title, e)
                    yield f"data: {json.dumps({'type': 'error', 'message': f'Failed to create {title}: {str(e)}'})}\n\n"

                # Rate limiting: ~2 requests/sec for GraphQL
                if idx < total_groups - 1:
                    await asyncio.sleep(1.0)

        yield f"data: {json.dumps({'type': 'complete', 'created': created_count, 'total': total_groups})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'message': f'Shopify connection failed: {str(e)}'})}\n\n"


@app.post("/api/push-to-shopify")
async def push_to_shopify(request: ShopifyPushRequest):
    """Push generated products and images to a Shopify store via GraphQL Admin API."""
    if not request.store_url.strip():
        raise HTTPException(status_code=400, detail="Store URL is required")
    if not request.client_id.strip() or not request.client_secret.strip():
        raise HTTPException(status_code=400, detail="Client ID and Client Secret are required")
    if not request.products:
        raise HTTPException(status_code=400, detail="Products array is required")

    return StreamingResponse(
        push_to_shopify_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
