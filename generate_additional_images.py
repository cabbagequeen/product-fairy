#!/usr/bin/env python3
"""
Generate additional product images for specific products.
"""

import logging
import os
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

# Model configuration
GEMINI_MODEL = "gemini-2.5-flash-image-preview"


def setup_logging() -> logging.Logger:
    """Set up logging configuration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[logging.StreamHandler()],
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


def generate_image(client: genai.Client, prompt: str, filename: str, max_retries: int = 3) -> bool:
    """Generate a single product image."""
    logger = logging.getLogger(__name__)

    jpg_file = Path(f"{filename}.jpg")
    if jpg_file.exists():
        logger.info(f"Image already exists for {filename}, skipping")
        return True

    png_file = Path(f"{filename}.png")

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

                        if convert_png_to_jpg(png_file, jpg_file):
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

            if image_saved:
                return True

            logger.warning(f"No image data received for {filename} on attempt {attempt + 1}")

        except Exception as e:
            logger.error(f"Error generating image for {filename} on attempt {attempt + 1}: {e}")

            if attempt < max_retries - 1:
                wait_time = (2 ** attempt) * 5
                logger.info(f"Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)

    logger.error(f"Failed to generate image for {filename} after {max_retries} attempts")
    return False


def main() -> None:
    """Generate additional images for CNCP1000."""
    load_dotenv()

    logger = setup_logging()
    logger.info("Starting additional image generation for CNCP1000")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY environment variable is not set")
        return

    try:
        client = genai.Client(api_key=api_key)
        logger.info("Successfully initialized Gemini client")
    except Exception as e:
        logger.error(f"Failed to initialize Gemini client: {e}")
        return

    images_to_generate = [
        {
            "filename": "CNCP1000_back",
            "prompt": (
                "Professional product photography showing the back view of a men's navy blue "
                "performance polo shirt laid flat on a pure white background (#FFFFFF). The polo "
                "is centered, evenly lit, showing the back collar, shoulder seams, and hem clearly. "
                "High-quality ecommerce photography style with soft, even lighting. No logos, no "
                "text, no embroidery."
            ),
        },
        {
            "filename": "CNCP1000_model_1",
            "prompt": (
                "Professional ecommerce product photography of an athletic male model wearing a "
                "navy blue performance polo shirt. Clean studio lighting against a neutral light "
                "gray background. Model has a confident, friendly expression, standing with arms "
                "at sides in a natural pose. The polo fits well, showing the quality and drape of "
                "the fabric. Professional commercial photography style suitable for an online store."
            ),
        },
        {
            "filename": "CNCP1000_model_2",
            "prompt": (
                "Professional ecommerce lifestyle photography of a fit male model wearing a navy "
                "blue performance polo shirt. The model is posed in a three-quarter view with one "
                "hand in pocket, looking directly at camera with a natural smile. Clean studio "
                "lighting with a soft white backdrop. The polo shirt shows excellent fit and "
                "professional styling. High-end commercial photography suitable for premium "
                "ecommerce website."
            ),
        },
    ]

    success_count = 0
    for image_info in images_to_generate:
        logger.info(f"Processing: {image_info['filename']}")

        if generate_image(client, image_info['prompt'], image_info['filename']):
            success_count += 1

        time.sleep(3)

    logger.info("=" * 50)
    logger.info("ADDITIONAL IMAGE GENERATION COMPLETE")
    logger.info(f"Successfully generated: {success_count}/{len(images_to_generate)} images")
    logger.info("Files created:")
    for image_info in images_to_generate:
        jpg_file = Path(f"{image_info['filename']}.jpg")
        status = "created" if jpg_file.exists() else "failed"
        logger.info(f"  {jpg_file.name}: {status}")
    logger.info("=" * 50)


if __name__ == "__main__":
    main()
