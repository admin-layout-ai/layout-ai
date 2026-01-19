# backend/app/services/__init__.py
# Floor plan generation services

from .azure_storage import (
    upload_to_blob,
    upload_floor_plan_image,
    load_all_sample_plans,
    get_sample_plan_info,
    sanitize_path,
    FLOOR_PLANS_CONTAINER,
    TRAINING_DATA_CONTAINER
)

from .geometry import (
    rooms_overlap,
    rooms_adjacent,
    get_aspect_ratio,
    get_room_bounds,
    get_room_center,
    get_room_area,
    room_fits_in_envelope,
    calculate_building_dimensions,
    WALL_INTERNAL,
    WALL_EXTERNAL,
    WALL_CALC,
    VALIDATION_TOLERANCE
)

from .council_validation import (
    get_council_requirements,
    get_setbacks,
    calculate_building_envelope,
    validate_floor_plan_council,
    validate_lot_requirements,
    get_all_councils,
    get_council_info,
    LotType,
    COUNCIL_REQUIREMENTS
)

from .NCC import (
    validate_floor_plan_ncc,
    validate_room_size,
    validate_garage,
    get_minimum_room_sizes,
    get_ncc_requirements_summary,
    get_climate_zone,
    get_energy_requirements,
    NCC_ROOM_SIZES,
    NCC_GARAGE_REQUIREMENTS
)

from .room_sizing import (
    calculate_room_sizes,
    get_room_size,
    get_total_area,
    format_room_sizes_for_prompt
)

from .sample_selection import (
    select_best_sample,
    select_top_samples,
    analyze_sample,
    filter_samples_by_bedrooms,
    filter_samples_with_images,
    get_sample_summary
)

from .layout_validation import (
    validate_room_connectivity,
    validate_generated_plan,
    run_full_validation,
    quick_validate_counts,
    get_validation_score
)

from .gemini_service import (
    get_gemini_client,
    analyze_generated_image,
    extract_floor_plan_json,
    generate_floor_plan_image,
    retry_image_generation,
    build_generation_prompt,
    generate_with_validation,
    NANO_BANANA_MODEL,
    NANO_BANANA_PRO_MODEL,
    MAX_GENERATION_ATTEMPTS
)

from .floor_plan_optimizer import (
    fix_floor_plan_error,
    parse_error_to_instruction,
    build_fix_prompt,
    get_error_category,
    estimate_fix_difficulty
)

__all__ = [
    # Azure Storage
    'upload_to_blob',
    'upload_floor_plan_image', 
    'load_all_sample_plans',
    'get_sample_plan_info',
    'sanitize_path',
    
    # Geometry
    'rooms_overlap',
    'rooms_adjacent',
    'get_aspect_ratio',
    'room_fits_in_envelope',
    'calculate_building_dimensions',
    
    # Council Validation
    'get_council_requirements',
    'get_setbacks',
    'calculate_building_envelope',
    'validate_floor_plan_council',
    'validate_lot_requirements',
    'get_all_councils',
    'get_council_info',
    
    # NCC
    'validate_floor_plan_ncc',
    'validate_room_size',
    'validate_garage',
    'get_minimum_room_sizes',
    'get_ncc_requirements_summary',
    
    # Room Sizing
    'calculate_room_sizes',
    'get_room_size',
    'format_room_sizes_for_prompt',
    
    # Sample Selection
    'select_best_sample',
    'select_top_samples',
    'analyze_sample',
    
    # Layout Validation
    'validate_room_connectivity',
    'validate_generated_plan',
    'run_full_validation',
    'get_validation_score',
    
    # Gemini Service
    'generate_with_validation',
    'analyze_generated_image',
    'extract_floor_plan_json',
    'build_generation_prompt',
    
    # Floor Plan Optimizer Service
    'fix_floor_plan_error',
    'parse_error_to_instruction',
    'build_fix_prompt',
    'get_error_category',
    'estimate_fix_difficulty',
]
