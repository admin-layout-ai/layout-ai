from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import ResourceExistsError
import os
from dotenv import load_dotenv
from io import BytesIO

load_dotenv()

class AzureStorageService:
    """Service for handling Azure Blob Storage operations"""
    
    def __init__(self):
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if not connection_string:
            raise ValueError("AZURE_STORAGE_CONNECTION_STRING not set")
        
        self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        self.containers = {
            'floor_plans': 'floor-plans',
            'uploads': 'user-uploads',
        }
        
        self._ensure_containers()
    
    def _ensure_containers(self):
        """Create containers if they don't exist"""
        for container_name in self.containers.values():
            try:
                self.blob_service_client.create_container(container_name)
            except ResourceExistsError:
                pass
    
    def upload_pdf(self, file_content: BytesIO, project_id: int, plan_id: int, filename: str = None) -> str:
        """Upload PDF to Azure Blob Storage"""
        if not filename:
            filename = f"project_{project_id}_plan_{plan_id}.pdf"
        
        blob_name = f"projects/{project_id}/{filename}"
        container_client = self.blob_service_client.get_container_client(self.containers['floor_plans'])
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
        container_client = self.blob_service_client.get_container_client(self.containers['uploads'])
        blob_client = container_client.get_blob_client(blob_name)
        
        blob_client.upload_blob(
            file_content,
            overwrite=True,
            content_settings=ContentSettings(content_type='image/png')
        )
        
        return blob_client.url

storage_service = AzureStorageService()