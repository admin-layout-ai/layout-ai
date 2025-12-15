from pydantic import validator
from typing import Optional

class ProjectValidators:
    """Validation rules for projects"""
    
    @staticmethod
    def validate_land_dimensions(width: float, depth: float) -> bool:
        """Validate land dimensions are reasonable"""
        if width < 5 or width > 100:
            raise ValueError("Land width must be between 5m and 100m")
        if depth < 10 or depth > 200:
            raise ValueError("Land depth must be between 10m and 200m")
        if width * depth > 5000:
            raise ValueError("Land area cannot exceed 5000 square meters")
        return True
    
    @staticmethod
    def validate_bedrooms(count: int) -> bool:
        """Validate bedroom count"""
        if count < 1 or count > 10:
            raise ValueError("Bedrooms must be between 1 and 10")
        return True
    
    @staticmethod
    def validate_bathrooms(count: float) -> bool:
        """Validate bathroom count"""
        if count < 1 or count > 10:
            raise ValueError("Bathrooms must be between 1 and 10")
        if count % 0.5 != 0:
            raise ValueError("Bathrooms must be in increments of 0.5 (e.g., 1.5, 2, 2.5)")
        return True