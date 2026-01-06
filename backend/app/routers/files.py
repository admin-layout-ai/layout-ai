# backend/app/routers/files.py
"""
File upload endpoints for Layout AI
Handles uploading files to Azure Blob Storage
- Contour plans: {userName}/{projectName}/Contour/{filename}
- Builder logos: {userName}/Logo/logo.{ext} (replaces existing)
"""
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from azure.storage.blob import BlobServiceClient, ContentSettings
from azure.core.exceptions import AzureError
from typing import Optional
import os
import re
import uuid
import logging
from datetime import datetime

from ..database import get_db
from .. import models
from ..auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/files", tags=["files"])

# Azure Blob Storage configuration
AZURE_STORAGE_CONNECTION_STRING = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
AZURE_STORAGE_CONTAINER = os.getenv("AZURE_STORAGE_CONTAINER", "user-uploads")
AZURE_STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "layoutaistorage")

# Allowed file types
ALLOWED_EXTENSIONS = {'.pdf', '.png', '.jpg', '.jpeg', '.dwg', '.dxf'}
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
MAX_LOGO_SIZE = 5 * 1024 * 1024   # 5MB

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


def delete_blobs_in_folder(container_client, folder_path: str):
    """Delete all blobs in a folder (used for logo replacement)"""
    try:
        blobs = list(container_client.list_blobs(name_starts_with=folder_path))
        for blob in blobs:
            logger.info(f"Deleting existing blob: {blob.name}")
            container_client.delete_blob(blob.name)
        return len(blobs)
    except Exception as e:
        logger.warning(f"Error deleting blobs in folder {folder_path}: {e}")
        return 0


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user_name: str = Form(...),
    project_name: str = Form(...),
    folder_type: str = Form(default="Contour"),
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload a file to Azure Blob Storage.
    
    Folder structure:
    - Contour: {userName}/{projectName}/Contour/{timestamp}_{filename}
    - Logo: {userName}/Logo/logo.{ext} (only 1 logo allowed, replaces existing)
    
    Args:
        file: The file to upload
        user_name: User's name for folder structure
        project_name: Project name for folder structure (ignored for Logo)
        folder_type: Type of folder - "Contour" or "Logo"
    
    Returns:
        url: The Azure Blob Storage URL of the uploaded file
        filename: The original filename
        size: File size in bytes
    """
    logger.info(f"File upload request - type: {folder_type}, user: {current_user.id}")
    
    # Validate file
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided"
        )
    
    # Get file extension
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    # Validate based on folder type
    if folder_type == "Logo":
        if file_ext not in ALLOWED_IMAGE_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file type for logo. Allowed: PNG, JPG, JPEG"
            )
        max_size = MAX_LOGO_SIZE
    else:
        if file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            )
        max_size = MAX_FILE_SIZE
    
    # Read file content
    content = await file.read()
    file_size = len(content)
    
    # Validate file size
    if file_size > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large. Maximum size: {max_size // (1024*1024)}MB"
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
        
        # Sanitize names
        sanitized_user = sanitize_name(user_name)
        sanitized_project = sanitize_name(project_name)
        sanitized_folder = sanitize_name(folder_type)
        
        # Build blob path based on folder type
        if folder_type == "Logo":
            # Logo path: {userName}/Logo/logo.{ext}
            # Only 1 logo allowed - delete existing before upload
            folder_path = f"{sanitized_user}/Logo/"
            
            # Delete any existing logos in this folder
            deleted_count = delete_blobs_in_folder(container_client, folder_path)
            if deleted_count > 0:
                logger.info(f"Deleted {deleted_count} existing logo(s) for user {sanitized_user}")
            
            # Use simple name for logo
            blob_name = f"{folder_path}logo{file_ext}"
        else:
            # Contour path: {userName}/{projectName}/Contour/{timestamp}_{filename}
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
        
        # Build the public URL
        blob_url = f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{AZURE_STORAGE_CONTAINER}/{blob_name}"
        
        logger.info(f"File uploaded successfully: {blob_url}")
        
        # If this is a logo, update the user's builder_logo_url in database
        if folder_type == "Logo":
            db_user = db.query(models.User).filter(
                models.User.azure_ad_id == current_user.id
            ).first()
            
            if db_user:
                db_user.builder_logo_url = blob_url
                db_user.updated_at = datetime.utcnow()
                db.commit()
                logger.info(f"Updated builder_logo_url for user {db_user.id}")
        
        return {
            "url": blob_url,
            "filename": file.filename,
            "size": file_size,
            "blob_name": blob_name,
            "folder_type": folder_type
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


@router.delete("/logo")
async def delete_logo(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete the current user's builder logo from blob storage and database.
    """
    logger.info(f"Logo delete request from user: {current_user.id}")
    
    # Get user from database
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not db_user.builder_logo_url:
        return {"message": "No logo to delete", "deleted": False}
    
    try:
        blob_service_client = get_blob_service_client()
        container_client = blob_service_client.get_container_client(AZURE_STORAGE_CONTAINER)
        
        # Extract blob name from URL
        # URL format: https://{account}.blob.core.windows.net/{container}/{blob_name}
        url_parts = db_user.builder_logo_url.split(f'{AZURE_STORAGE_CONTAINER}/')
        if len(url_parts) == 2:
            blob_name = url_parts[1]
            try:
                container_client.delete_blob(blob_name)
                logger.info(f"Deleted blob: {blob_name}")
            except AzureError as e:
                logger.warning(f"Could not delete blob {blob_name}: {e}")
        
        # Clear URL in database
        db_user.builder_logo_url = None
        db_user.updated_at = datetime.utcnow()
        db.commit()
        
        return {"message": "Logo deleted successfully", "deleted": True}
        
    except Exception as e:
        logger.error(f"Error deleting logo: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete logo: {str(e)}"
        )


@router.get("/logo")
async def get_logo(
    current_user: AuthenticatedUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the current user's builder logo URL.
    """
    db_user = db.query(models.User).filter(
        models.User.azure_ad_id == current_user.id
    ).first()
    
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "logo_url": db_user.builder_logo_url,
        "has_logo": db_user.builder_logo_url is not None
    }


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
