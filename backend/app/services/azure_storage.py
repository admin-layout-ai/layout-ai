# backend/app/services/azure_storage.py
# Azure Blob Storage operations for Layout AI
# Handles uploads, floor plan storage, and sample plan loading

from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import ResourceExistsError
from typing import List, Optional, Dict, Any
import os
import re
import json
import base64
import logging
from dotenv import load_dotenv
from io import BytesIO

load_dotenv()

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

AZURE_STORAGE_ACCOUNT = os.getenv("AZURE_STORAGE_ACCOUNT", "layoutaistorage")

# Container names
CONTAINERS = {
    'floor_plans': 'floor-plans',
    'uploads': 'user-uploads',
    'training_data': 'training-data',
}

# Backwards compatibility aliases
FLOOR_PLANS_CONTAINER = CONTAINERS['floor_plans']
TRAINING_DATA_CONTAINER = CONTAINERS['training_data']


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def sanitize_path(name: str) -> str:
    """
    Sanitize a string for use in file/blob paths.
    
    Removes special characters and limits length.
    """
    if not name:
        return "unknown"
    sanitized = re.sub(r'[^\w\s-]', '', name)
    sanitized = re.sub(r'[\s]+', '_', sanitized)
    return sanitized[:50]


def get_blob_path(user_name: str, project_name: str, plan_id: int, filename: str = "floor_plan.png") -> str:
    """
    Generate a standardized blob path for floor plan files.
    
    Path structure: {user_folder}/{project_folder}/{filename}
    Example: Admin_Layout-AI/Admin_Plan_1/floor_plan_1.png
    
    For multi-variant support, the filename should include the variant number
    (e.g., floor_plan_1.png, floor_plan_2.png, floor_plan_3.png)
    """
    user_folder = sanitize_path(user_name) if user_name else "unknown_user"
    project_folder = sanitize_path(project_name) if project_name else f"project_{plan_id}"
    return f"{user_folder}/{project_folder}/{filename}"


# =============================================================================
# AZURE STORAGE SERVICE CLASS
# =============================================================================

class AzureStorageService:
    """Service for handling Azure Blob Storage operations"""
    
    def __init__(self):
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if not connection_string:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRING not set")
        
        self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        self.containers = CONTAINERS
        
        self._ensure_containers()
    
    def _ensure_containers(self):
        """Create containers if they don't exist"""
        for container_name in self.containers.values():
            try:
                self.blob_service_client.create_container(container_name)
            except ResourceExistsError:
                pass
    
    def get_container_client(self, container_key: str):
        """Get a container client by key or name."""
        container_name = self.containers.get(container_key, container_key)
        return self.blob_service_client.get_container_client(container_name)
    
    # =========================================================================
    # EXISTING UPLOAD METHODS
    # =========================================================================
    
    def upload_pdf(self, file_content: BytesIO, project_id: int, plan_id: int, filename: str = None) -> str:
        """Upload PDF to Azure Blob Storage"""
        if not filename:
            filename = f"project_{project_id}_plan_{plan_id}.pdf"
        
        blob_name = f"projects/{project_id}/{filename}"
        container_client = self.get_container_client('floor_plans')
        blob_client = container_client.get_blob_client(blob_name)
        
        blob_client.upload_blob(
            file_content,
            overwrite=True,
            content_settings=ContentSettings(content_type='application/pdf')
        )
        
        return blob_client.url
    
    def upload_image(self, file_content: BytesIO, project_id: int, filename: str) -> str:
        """Upload image (preview, contour plan, etc.)"""
        blob_name = f"projects/{project_id}/{filename}"
        container_client = self.get_container_client('uploads')
        blob_client = container_client.get_blob_client(blob_name)
        
        blob_client.upload_blob(
            file_content,
            overwrite=True,
            content_settings=ContentSettings(content_type='image/png')
        )
        
        return blob_client.url
    
    # =========================================================================
    # FLOOR PLAN UPLOAD METHODS
    # =========================================================================
    
    def upload_floor_plan(
        self, 
        data: bytes, 
        blob_name: str, 
        content_type: str = "image/png"
    ) -> Optional[str]:
        """
        Upload floor plan data to blob storage.
        
        Args:
            data: Binary data to upload
            blob_name: Path/name for the blob
            content_type: MIME type (default: image/png)
        
        Returns:
            Public URL of uploaded blob, or None if upload failed
        """
        try:
            container_client = self.get_container_client('floor_plans')
            blob_client = container_client.get_blob_client(blob_name)
            
            blob_client.upload_blob(
                data,
                overwrite=True,
                content_settings=ContentSettings(content_type=content_type)
            )
            
            url = f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/{self.containers['floor_plans']}/{blob_name}"
            logger.info(f"Uploaded floor plan: {blob_name}")
            return url
            
        except Exception as e:
            logger.error(f"Failed to upload floor plan {blob_name}: {e}")
            return None
    
    def upload_floor_plan_image(
        self,
        image_bytes: bytes,
        user_name: str,
        project_name: str,
        plan_id: int,
        filename: str = "floor_plan.png"
    ) -> Optional[str]:
        """
        Upload a floor plan image with standardized path.
        
        Args:
            image_bytes: PNG/JPG image data
            user_name: User's name for folder structure
            project_name: Project name for folder structure
            plan_id: Floor plan ID
            filename: Output filename
        
        Returns:
            Public URL of the uploaded image
        """
        blob_path = get_blob_path(user_name, project_name, plan_id, filename)
        content_type = "image/png" if filename.endswith(".png") else "image/jpeg"
        return self.upload_floor_plan(image_bytes, blob_path, content_type)
    
    def upload_floor_plan_pdf(
        self,
        pdf_bytes: bytes,
        user_name: str,
        project_name: str,
        plan_id: int,
        filename: str = "floor_plan.pdf"
    ) -> Optional[str]:
        """Upload a floor plan PDF with standardized path."""
        blob_path = get_blob_path(user_name, project_name, plan_id, filename)
        return self.upload_floor_plan(pdf_bytes, blob_path, "application/pdf")
    
    def upload_floor_plan_dxf(
        self,
        dxf_bytes: bytes,
        user_name: str,
        project_name: str,
        plan_id: int,
        filename: str = "floor_plan.dxf"
    ) -> Optional[str]:
        """Upload a floor plan DXF/CAD file with standardized path."""
        blob_path = get_blob_path(user_name, project_name, plan_id, filename)
        return self.upload_floor_plan(dxf_bytes, blob_path, "application/dxf")
    
    # =========================================================================
    # SAMPLE PLAN LOADING
    # =========================================================================
    
    def load_all_sample_plans(self) -> List[Dict[str, Any]]:
        """
        Load ALL sample floor plans (JSON + image pairs) from training-data container.
        
        Scans the training-data container for floor plan samples.
        Each sample should have a JSON file with room data and optionally a PNG image.
        
        Returns:
            List of samples, each containing:
            - 'filename': Base filename
            - 'json_data': Parsed JSON data
            - 'image_bytes': Raw image bytes (if available)
            - 'image_base64': Base64 encoded image (if available)
            - 'image_type': MIME type of image
        """
        try:
            container_client = self.get_container_client('training_data')
            all_blobs = list(container_client.list_blobs(name_starts_with="floor-plans/"))
            
            # Group blobs by plan name (basename without extension)
            plan_groups: Dict[str, Dict[str, Any]] = {}
            
            for blob in all_blobs:
                name = blob.name
                base_name = os.path.splitext(os.path.basename(name))[0]
                
                if base_name not in plan_groups:
                    plan_groups[base_name] = {'filename': base_name}
                
                if name.lower().endswith('.json'):
                    plan_groups[base_name]['json_blob'] = name
                elif name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    plan_groups[base_name]['image_blob'] = name
            
            logger.info(f"Found {len(plan_groups)} sample plan groups in training-data")
            
            # Download each plan's data
            samples = []
            for plan_id, plan_info in sorted(plan_groups.items()):
                # Skip if no JSON file
                if 'json_blob' not in plan_info:
                    continue
                
                sample = {'filename': plan_id}
                
                # Load JSON data
                try:
                    json_client = container_client.get_blob_client(plan_info['json_blob'])
                    json_data = json_client.download_blob().readall()
                    sample['json_data'] = json.loads(json_data.decode('utf-8'))
                except Exception as e:
                    logger.warning(f"Could not load JSON {plan_info.get('json_blob')}: {e}")
                    continue
                
                # Load image if available
                if 'image_blob' in plan_info:
                    try:
                        img_client = container_client.get_blob_client(plan_info['image_blob'])
                        img_data = img_client.download_blob().readall()
                        sample['image_bytes'] = img_data
                        sample['image_base64'] = base64.b64encode(img_data).decode('utf-8')
                        sample['image_type'] = 'image/png' if plan_info['image_blob'].lower().endswith('.png') else 'image/jpeg'
                    except Exception as e:
                        logger.warning(f"Could not load image for {plan_id}: {e}")
                
                samples.append(sample)
            
            logger.info(f"Loaded {len(samples)} complete sample plans")
            return samples
        
        except Exception as e:
            logger.error(f"Failed to load sample plans: {e}")
            import traceback
            traceback.print_exc()
            return []
    
    def get_sample_plan(self, filename: str) -> Optional[Dict[str, Any]]:
        """
        Load a specific sample plan by filename.
        
        Args:
            filename: Base filename (without extension)
        
        Returns:
            Sample dict or None if not found
        """
        samples = self.load_all_sample_plans()
        for sample in samples:
            if sample.get('filename') == filename:
                return sample
        return None
    
    # =========================================================================
    # DOWNLOAD METHODS
    # =========================================================================
    
    def download_blob(self, container_key: str, blob_name: str) -> Optional[bytes]:
        """Download a blob and return its contents."""
        try:
            container_client = self.get_container_client(container_key)
            blob_client = container_client.get_blob_client(blob_name)
            return blob_client.download_blob().readall()
        except Exception as e:
            logger.error(f"Failed to download blob {blob_name}: {e}")
            return None
    
    def get_blob_url(self, container_key: str, blob_name: str) -> str:
        """Get the public URL for a blob."""
        container_name = self.containers.get(container_key, container_key)
        return f"https://{AZURE_STORAGE_ACCOUNT}.blob.core.windows.net/{container_name}/{blob_name}"
    
    def blob_exists(self, container_key: str, blob_name: str) -> bool:
        """Check if a blob exists."""
        try:
            container_client = self.get_container_client(container_key)
            blob_client = container_client.get_blob_client(blob_name)
            return blob_client.exists()
        except Exception:
            return False
    
    def delete_blob(self, container_key: str, blob_name: str) -> bool:
        """Delete a blob."""
        try:
            container_client = self.get_container_client(container_key)
            blob_client = container_client.get_blob_client(blob_name)
            blob_client.delete_blob()
            logger.info(f"Deleted blob: {blob_name}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete blob {blob_name}: {e}")
            return False
    
    def list_blobs(self, container_key: str, prefix: str = None) -> List[str]:
        """List all blobs in a container with optional prefix."""
        try:
            container_client = self.get_container_client(container_key)
            blobs = container_client.list_blobs(name_starts_with=prefix)
            return [blob.name for blob in blobs]
        except Exception as e:
            logger.error(f"Failed to list blobs: {e}")
            return []


# =============================================================================
# SINGLETON INSTANCE
# =============================================================================

# Lazy initialization to avoid errors if connection string not set
_storage_service = None

def get_storage_service() -> AzureStorageService:
    """Get the singleton storage service instance."""
    global _storage_service
    if _storage_service is None:
        _storage_service = AzureStorageService()
    return _storage_service


# For backwards compatibility
try:
    storage_service = AzureStorageService()
except ValueError:
    storage_service = None
    logger.warning("Azure Storage not configured - storage_service is None")


# =============================================================================
# MODULE-LEVEL CONVENIENCE FUNCTIONS
# =============================================================================

def upload_to_blob(
    data: bytes, 
    blob_name: str, 
    content_type: str,
    container_name: str = 'floor-plans'
) -> Optional[str]:
    """
    Upload data to blob storage (module-level convenience function).
    
    Args:
        data: Binary data to upload
        blob_name: Path/name for the blob
        content_type: MIME type
        container_name: Target container
    
    Returns:
        Public URL of uploaded blob, or None if failed
    """
    service = get_storage_service()
    return service.upload_floor_plan(data, blob_name, content_type)


def upload_floor_plan_image(
    image_bytes: bytes,
    user_name: str,
    project_name: str,
    plan_id: int,
    filename: str = "floor_plan.png"
) -> Optional[str]:
    """Upload a floor plan image (module-level convenience function)."""
    service = get_storage_service()
    return service.upload_floor_plan_image(image_bytes, user_name, project_name, plan_id, filename)


def load_all_sample_plans() -> List[Dict[str, Any]]:
    """Load all sample plans (module-level convenience function)."""
    service = get_storage_service()
    return service.load_all_sample_plans()


def get_sample_plan_info(samples: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract summary info from loaded sample plans.
    
    Useful for API responses listing available samples.
    """
    info = []
    for sample in samples:
        json_data = sample.get('json_data', {})
        rooms = json_data.get('rooms', [])
        metadata = json_data.get('metadata', {})
        
        # Calculate dimensions from rooms
        if rooms:
            width = max(r.get('x', 0) + r.get('width', 0) for r in rooms)
            depth = max(r.get('y', 0) + r.get('depth', 0) for r in rooms)
        else:
            width, depth = 0, 0
        
        # Count room types
        bedroom_count = metadata.get('bedrooms', 
            sum(1 for r in rooms if 'bed' in r.get('type', '').lower()))
        bathroom_count = metadata.get('bathrooms',
            sum(1 for r in rooms if 'bath' in r.get('type', '').lower() or 'ensuite' in r.get('type', '').lower()))
        
        info.append({
            'filename': sample.get('filename'),
            'has_image': 'image_bytes' in sample,
            'bedrooms': bedroom_count,
            'bathrooms': bathroom_count,
            'room_count': len(rooms),
            'dimensions': f"{width:.1f}m × {depth:.1f}m",
            'width': width,
            'depth': depth,
            'has_study': any('study' in r.get('type', '').lower() or 'office' in r.get('type', '').lower() for r in rooms),
            'has_lounge': any('lounge' in r.get('type', '').lower() for r in rooms),
        })
    
    return info
