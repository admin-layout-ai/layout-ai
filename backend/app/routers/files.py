# backend/app/routers/files.py
"""
File upload endpoints for Layout AI
Handles uploading files to Azure Blob Storage
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import AzureError
from typing import Optional
import os
import re
import uuid
import logging
from datetime import datetime

from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/files", tags=["files"])

# Azure Blob Storage configuration
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "user-uploads")

# Allowed file types
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.dwg', '.dxf'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# Content types mapping
CONTENT_TYPES = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.dwg': 'application/acad',
    '.dxf': 'application/dxf',
}


def sanitize_name(name: str) -> str:
    """Sanitize file/folder name for Azure Blob Storage"""
    # Remove or replace invalid characters
    sanitized = re.sub(r'[^\w\s\-\.]', '', name)
    # Replace spaces with underscores
    sanitized = sanitized.replace(' ', '_')
    # Limit length
    return sanitized[:100]


def get_blob_service_client() -> BlobServiceClient:
    """Get Azure Blob Service Client"""
    if not AZURE_STORAGE_CONNECTION_STRING:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Azure Storage not configured"
        )
    return BlobServiceClient.from_connection_string(AZURE_STORAGE_CONNECTION_STRING)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user_name: str = Form(...),
    project_name: str = Form(...),
    folder_type: str = Form(default="Contour"),
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Upload a file to Azure Blob Storage.
    
    Creates folder structure: {user_name}/{project_name}/{folder_type}/{filename}
    
    Args:
        file: The file to upload
        user_name: User's name for folder structure
        project_name: Project name for folder structure
        folder_type: Type of folder (Contour, Survey, etc.)
    
    Returns:
        url: The Azure Blob Storage URL of the uploaded file
        filename: The original filename
        size: File size in bytes
    """
    logger.info(f"File upload request from user: {current_user.id}")
    
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    
    # Get file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate file size
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty"
        )
    
    try:
        # Get blob service client
        blob_service_client = get_blob_service_client()
        container_client = blob_service_client.get_container_client(AZURE_STORAGE_CONTAINER)
        
        # Create container if it doesn't exist
        try:
            container_client.create_container()
            logger.info(f"Created container: {AZURE_STORAGE_CONTAINER}")
        except AzureError:
            # Container already exists
            pass
        
        # Build blob path: userName/projectName/folderType/filename
        sanitized_user = sanitize_name(user_name)
        sanitized_project = sanitize_name(project_name)
        sanitized_folder = sanitize_name(folder_type)
        
        # Add unique suffix to filename to prevent overwrites
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        unique_id = str(uuid.uuid4())[:8]
        original_name = os.path.splitext(file.filename)[0]
        sanitized_filename = sanitize_name(original_name)
        
        blob_name = f"{sanitized_user}/{sanitized_project}/{sanitized_folder}/{sanitized_filename}_{timestamp}_{unique_id}{file_ext}"
        
        logger.info(f"Uploading to blob: {blob_name}")
        
        # Get blob client
        blob_client = container_client.get_blob_client(blob_name)
        
        # Set content type
        content_type = CONTENT_TYPES.get(file_ext, 'application/octet-stream')
        content_settings = ContentSettings(content_type=content_type)
        
        # Upload the file
        blob_client.upload_blob(
            content,
            overwrite=True,
            content_settings=content_settings
        )
        
        # Get the URL
        blob_url = blob_client.url
        
        logger.info(f"File uploaded successfully: {blob_url}")
        
        return {
            "url": blob_url,
            "filename": file.filename,
            "size": file_size,
            "blob_name": blob_name
        }
        
    except AzureError as e:
        logger.error(f"Azure Storage error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload file to storage: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during file upload: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during file upload"
        )


@router.delete("/delete")
async def delete_file(
    blob_url: str,
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Delete a file from Azure Blob Storage.
    
    Args:
        blob_url: The full URL of the blob to delete
    """
    logger.info(f"File delete request from user: {current_user.id}")
    
    try:
        blob_service_client = get_blob_service_client()
        
        # Parse blob name from URL
        # URL format: https://{account}.blob.core.windows.net/{container}/{blob_name}
        parts = blob_url.split(f'{AZURE_STORAGE_CONTAINER}/')
        if len(parts) != 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid blob URL"
            )
        
        blob_name = parts[1]
        
        container_client = blob_service_client.get_container_client(AZURE_STORAGE_CONTAINER)
        blob_client = container_client.get_blob_client(blob_name)
        
        blob_client.delete_blob()
        
        logger.info(f"File deleted successfully: {blob_name}")
        
        return {"message": "File deleted successfully"}
        
    except AzureError as e:
        logger.error(f"Azure Storage error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete file: {str(e)}"
        )