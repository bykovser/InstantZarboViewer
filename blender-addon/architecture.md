# Zarbo Blender Addon Architecture

## Overview

The Zarbo Blender Addon is a plugin for Blender 3D that enables users to upload 3D models to the Zarbo platform for augmented reality (AR) visualization. The addon provides both simple and advanced workflows for uploading scene objects or files directly to the Zarbo service.

## Project Structure

```
blender-addon/
├── __init__.py          # Main addon registration and Blender properties
├── config/
│   ├── __init__.py      # API config instance initialization
│   └── api.py           # Zarbo API endpoint configuration
├── managers/
│   ├── __init__.py      # Empty (placeholder)
│   ├── temp.py          # Temporary file management
│   └── zarbo.py         # Core API interaction logic
├── operators/
│   ├── __init__.py      # Empty (placeholder)
│   ├── api_key.py       # API key management operator
│   ├── auth.py          # Authentication operator
│   ├── collection.py    # Collection management operator
│   ├── file_loader.py   # File loading operator
│   ├── file_sender.py   # File sending operator
│   ├── general_panel.py # Main UI panel
│   └── product.py       # Product management operator
└── README.md            # User documentation
```

## Core Components

### 1. Configuration Layer (`config/`)

**ZarboApiConfig** ([`config/api.py`](config/api.py:4)) - Central API configuration class that provides dynamic endpoint URLs:
- Host configuration via environment variable `ZARBO_API_HOST`
- Endpoints for authentication, collections, products, models, and widgets
- Property-based URL construction for flexibility

### 2. Manager Layer (`managers/`)

**TempManager** ([`managers/temp.py`](managers/temp.py:4)) - Singleton for temporary directory management:
- Creates and manages a single temporary directory instance
- Provides cleanup functionality

**ZarboManager** ([`managers/zarbo.py`](managers/zarbo.py:5)) - Core API interaction class with static methods:
- Model management: create, list, update models
- Collection operations: create, list collections
- Product operations: create, list products
- Widget management: create, get widgets for AR visualization
- API key validation

### 3. Operator Layer (`operators/`)

**Authentication Operators:**
- [`AuthOperator`](operators/auth.py:6) - Validates API key and sets authentication token
- [`ResetApiKeyOperator`](operators/api_key.py:5) - Resets API key and shows input field

**File Management Operators:**
- [`FileLoaderOperator`](operators/file_loader.py:5) - Loads files from disk for upload
- [`SendFileOperator`](operators/file_sender.py:7) - Main file sending logic with two modes:
  - Upload selected scene objects (exports as GLB)
  - Upload pre-loaded file from disk

**Data Management Operators:**
- [`UpdateCollectionsOperator`](operators/collection.py:6) - Fetches and updates collection list
- [`UpdateProductsOperator`](operators/product.py:6) - Fetches and updates product list

**UI Components:**
- [`ZarboPanel`](operators/general_panel.py:4) - Main UI panel in Blender properties

### 4. Main Registration (`__init__.py`)

Handles addon registration with Blender:
- Registers all operators and panels
- Defines Blender scene properties for:
  - API key storage (`zarbo_user_pass`)
  - Access token (`zarbo_access_token`)
  - File content and metadata
  - UI state management properties
  - Collection and product selection enums

## Key Integration Points

### API Integration
The addon integrates with Zarbo's REST API through these endpoints:
- **Authentication**: `POST /api/token/` (API key validation)
- **Collections**: `GET/POST /api/v1/collections/`
- **Products**: `GET/POST /api/v1/products/`
- **Models**: `POST /api/v1/models/` (file upload)
- **Widgets**: `GET/POST /api/v1/widgets/` (AR visualization)

### File Processing
Two upload modes supported:
1. **Scene Export**: Exports selected Blender objects as GLB format
2. **Direct File Upload**: Uploads pre-loaded files from disk (supports various formats including USDZ)

### Authentication Flow
1. User enters API key in UI
2. [`AuthOperator`](operators/auth.py:12) validates key via [`ZarboManager.validate_api_key()`](managers/zarbo.py:128)
3. Valid token stored in `bpy.context.scene['zarbo_access_token']`
4. Subsequent API calls use this token for authorization

## Data Flow

### Simple Workflow:
1. User selects objects in Blender
2. Clicks "Получить ссылку" (Get Link)
3. Addon exports scene as GLB → Creates collection/product → Uploads model → Creates widget → Returns AR URL

### Advanced Workflow:
1. User enables "Расширенные настройки" (Advanced settings)
2. Selects specific collection and product
3. Optionally loads file from disk
4. Uploads to specified location

## Integration Opportunities

### For External Integration:

1. **API Manager** ([`ZarboManager`](managers/zarbomanagers/zarbo.py:5)) - Can be imported and used directly for Zarbo API operations
2. **Configuration** ([`ZarboApiConfig`](config/api.py:4)) - Flexible host configuration for different environments
3. **File Processing** - Support for both scene export and direct file upload

### Key Classes for Reuse:
- [`ZarboManager`](managers/zarbo.py:5) - Complete API wrapper with error handling
- [`TempManager`](managers/temp.py:4) - Reusable temporary file management
- Individual operators for specific functionality

### Extension Points:
- Add new file format support in [`SendFileOperator`](operators/file_sender.py:35)
- Custom authentication methods in [`AuthOperator`](operators/auth.py:6)
- Additional API endpoints in [`ZarboManager`](managers/zarbo.py:5)

## Dependencies

- **Blender 2.80+** - Required for bpy module and UI components
- **Python requests** - For HTTP API communication
- **Standard library**: os, tempfile, uuid

## Error Handling

The addon uses assertion-based error handling with descriptive messages from API responses. All API calls include proper error checking and user feedback.

## Security Considerations

- API keys are stored in Blender scene properties
- Temporary files are properly cleaned up after use
- All API communication uses HTTPS