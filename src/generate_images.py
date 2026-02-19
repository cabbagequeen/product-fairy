#!/usr/bin/env python3
"""
Product Image Generator using Google Gemini AI

This script reads product data from a CSV file and generates professional
product images using Google's Gemini AI model.

Requirements:
- ffmpeg installed for PNG to JPG conversion
- CSV file must be in ../data/image_sheet.csv relative to this script

Usage:
    python generate_images.py
"""

import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Dict, List

import pandas as pd
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Model configuration
GEMINI_MODEL = "gemini-2.5-flash-image-preview"


def setup_logging() -> logging.Logger:
    """Set up logging configuration."""
    # Create logs directory if it doesn't exist
    logs_dir = Path(__file__).parent.parent / "output" / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    # Configure logging
    log_file = logs_dir / f"image_generation_{int(time.time())}.log"

    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )

    return logging.getLogger(__name__)


def save_binary_file(file_path: str, data: bytes) -> bool:
    """Save binary data to file."""
    try:
        with open(file_path, "wb") as f:
            f.write(data)
        return True
    except Exception as e:
        logging.error(f"Failed to save file {file_path}: {e}")
        return False


def load_product_data(csv_path: str) -> List[Dict]:
    """Load and validate product data from CSV file."""
    logger = logging.getLogger(__name__)

    try:
        # Read CSV file
        df = pd.read_csv(csv_path)
        logger.info(f"Loaded CSV with {len(df)} rows")

        # Filter out invalid rows (like the Google Docs link)
        valid_products = []

        for index, row in df.iterrows():
            # Skip rows that don't have proper product numbers
            if pd.isna(row.get('ProductNumber')) or not str(row['ProductNumber']).startswith('CNC-P'):
                logger.warning(f"Skipping invalid row {index + 1}: {row.get('ProductNumber', 'N/A')}")
                continue

            # Skip rows without prompts
            if pd.isna(row.get('FlatLayPrompt')) or not row['FlatLayPrompt'].strip():
                logger.warning(f"Skipping row {index + 1} - missing prompt: {row['ProductNumber']}")
                continue

            # Skip rows with "Gregg" in the first column (unnamed column)
            first_column_value = str(row.iloc[0]) if len(row) > 0 else ""
            if "Gregg" in first_column_value:
                logger.info(f"Skipping row {index + 1} - Gregg row: {row['ProductNumber']}")
                continue

            valid_products.append({
                'product_number': str(row['ProductNumber']).strip(),
                'gender_code': str(row.get('GenderCode', 'U')).strip(),
                'color_code': str(row.get('ColorCode', '')).strip(),
                'product_name': str(row.get('ProductName', '')).strip(),
                'color_name': str(row.get('ColorName', '')).strip(),
                'prompt': str(row['FlatLayPrompt']).strip()
            })

        logger.info(f"Found {len(valid_products)} valid products to process")
        return valid_products

    except Exception as e:
        logger.error(f"Failed to load CSV file {csv_path}: {e}")
        sys.exit(1)


def create_filename(product_number: str, gender_code: str, color_code: str) -> str:
    """Create filename from ProductNumber + GenderCode + ColorCode, removing dashes."""
    # Remove dashes from product number and combine with gender and color codes
    clean_product_number = product_number.replace('-', '')
    return f"{clean_product_number}{gender_code}{color_code}"


def convert_png_to_jpg(png_path: Path, jpg_path: Path) -> bool:
    """Convert PNG to JPG using ffmpeg."""
    logger = logging.getLogger(__name__)

    try:
        subprocess.run(
            ['ffmpeg', '-i', str(png_path), '-q:v', '2', '-y', str(jpg_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        logger.info(f"Successfully converted {png_path.name} to {jpg_path.name}")
        return True

    except subprocess.CalledProcessError as e:
        logger.error(f"ffmpeg conversion failed for {png_path.name}: {e.stderr}")
        return False
    except FileNotFoundError:
        logger.error("ffmpeg not found. Please install ffmpeg to enable PNG to JPG conversion.")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during conversion of {png_path.name}: {e}")
        return False


def generate_image(client: genai.Client, prompt: str, filename: str, output_dir: Path, max_retries: int = 3) -> bool:
    """Generate a single product image.

    Note: Caller should verify the output file doesn't already exist before calling.
    """
    logger = logging.getLogger(__name__)

    jpg_file = output_dir / f"{filename}.jpg"
    png_file = output_dir / f"{filename}.png"

    for attempt in range(max_retries):
        try:
            logger.info(f"Generating image for {filename} (attempt {attempt + 1}/{max_retries})")

            contents = [
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=prompt)],
                ),
            ]

            generate_content_config = types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            )

            response_chunks = list(client.models.generate_content_stream(
                model=GEMINI_MODEL,
                contents=contents,
                config=generate_content_config,
            ))

            # Process response chunks
            image_saved = False
            for chunk in response_chunks:
                if (
                    chunk.candidates is None
                    or chunk.candidates[0].content is None
                    or chunk.candidates[0].content.parts is None
                ):
                    continue

                part = chunk.candidates[0].content.parts[0]
                if part.inline_data and part.inline_data.data:
                    if save_binary_file(str(png_file), part.inline_data.data):
                        logger.info(f"Successfully generated PNG: {png_file.name}")

                        # Convert PNG to JPG
                        if convert_png_to_jpg(png_file, jpg_file):
                            # Remove the temporary PNG file
                            try:
                                png_file.unlink()
                                logger.debug(f"Removed temporary PNG: {png_file.name}")
                            except Exception as e:
                                logger.warning(f"Could not remove temporary PNG {png_file.name}: {e}")

                            image_saved = True
                            break
                        else:
                            logger.error(f"Failed to convert {png_file.name} to JPG")
                            break
                else:
                    # Log any text responses
                    if hasattr(chunk, 'text') and chunk.text:
                        logger.debug(f"API response text for {filename}: {chunk.text}")

            if image_saved:
                return True
            else:
                logger.warning(f"No image data received for {filename} on attempt {attempt + 1}")

        except Exception as e:
            logger.error(f"Error generating image for {filename} on attempt {attempt + 1}: {e}")

            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 5  # Exponential backoff: 5s, 10s, 20s
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)

    logger.error(f"Failed to generate image for {filename} after {max_retries} attempts")
    return False


def main() -> None:
    """Main function to orchestrate the image generation process."""
    load_dotenv()

    logger = setup_logging()
    logger.info("Starting product image generation process")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY environment variable is not set")
        return
    logger.info("Using configured Gemini API key")

    # Set up paths
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    csv_path = project_dir / "data" / "image_sheet.csv"
    output_dir = project_dir / "output" / "generated_images"

    # Create output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Validate CSV file exists
    if not csv_path.exists():
        logger.error(f"CSV file not found: {csv_path}")
        sys.exit(1)

    # Load product data
    products = load_product_data(str(csv_path))
    if not products:
        logger.error("No valid products found in CSV file")
        sys.exit(1)

    # Initialize Gemini client
    try:
        client = genai.Client(api_key=api_key)
        logger.info("Successfully initialized Gemini client")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
        sys.exit(1)

    # Process each product
    total_products = len(products)
    successful_generations = 0
    failed_generations = 0
    skipped_generations = 0

    logger.info(f"Starting to process {total_products} products")

    for i, product in enumerate(products, 1):
        filename = create_filename(
            product['product_number'],
            product['gender_code'],
            product['color_code'],
        )
        logger.info(
            f"Processing {i}/{total_products}: {filename} "
            f"({product['product_name']} - {product['gender_code']} - {product['color_name']})"
        )

        output_file = output_dir / f"{filename}.jpg"
        if output_file.exists():
            logger.info(f"Image already exists for {filename}, skipping")
            skipped_generations += 1
            continue

        success = generate_image(client, product['prompt'], filename, output_dir)

        if success:
            successful_generations += 1
        else:
            failed_generations += 1

        # Add small delay between requests to be respectful to the API
        if i < total_products:
            time.sleep(2)

        # Progress update every 10 items
        if i % 10 == 0 or i == total_products:
            logger.info(f"Progress: {i}/{total_products} processed. "
                       f"Success: {successful_generations}, "
                       f"Failed: {failed_generations}, "
                       f"Skipped: {skipped_generations}")

    # Final summary
    logger.info("=" * 60)
    logger.info("IMAGE GENERATION COMPLETE")
    logger.info(f"Total products processed: {total_products}")
    logger.info(f"Successfully generated: {successful_generations}")
    logger.info(f"Failed to generate: {failed_generations}")
    logger.info(f"Skipped (already exist): {skipped_generations}")
    logger.info(f"Output directory: {output_dir}")
    logger.info("=" * 60)

    if failed_generations > 0:
        logger.warning("Some images failed to generate. Check the logs for details.")
        sys.exit(1)

    logger.info("All images generated successfully!")


if __name__ == "__main__":
    main()