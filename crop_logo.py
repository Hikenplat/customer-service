"""
Script to crop white space from the HSBC logo
"""
from PIL import Image

def crop_whitespace(image_path, output_path):
    # Open the image
    img = Image.open(image_path)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Get the bounding box of non-white pixels
    # Create a mask of non-white pixels
    bbox = img.getbbox()
    
    if bbox:
        # Crop the image to the bounding box
        cropped = img.crop(bbox)
        
        # Save the cropped image
        cropped.save(output_path)
        print(f"✅ Logo cropped successfully!")
        print(f"   Original size: {img.size}")
        print(f"   Cropped size: {cropped.size}")
        print(f"   Saved to: {output_path}")
    else:
        print("❌ Could not find content to crop")

if __name__ == "__main__":
    input_path = "scripts/public/hsbc_logo.png"
    output_path = "scripts/public/hsbc_logo.png"
    
    try:
        crop_whitespace(input_path, output_path)
    except Exception as e:
        print(f"❌ Error: {e}")
        print("\n💡 Make sure Pillow is installed: pip install Pillow")
