# Zarbo Viewer LAN Addon

## Registration Conflict Resolution

### Problem
The addon was experiencing class registration conflicts in Blender, causing errors when enabling or reloading the addon. These conflicts arose from multiple registration attempts of the same classes across different modules.

### Solution Implemented

#### 1. Safe Registration Mechanism
In `UI.py`, we introduced two key functions:
- `safe_register_class(cls)`: Registers a class only if it hasn't been registered before
- `safe_unregister_class(cls)`: Unregisters a class only if it's in the registered set

```python
_REGISTERED_CLASSES = set()

def safe_register_class(cls):
    try:
        if cls not in _REGISTERED_CLASSES:
            bpy.utils.register_class(cls)
            _REGISTERED_CLASSES.add(cls)
            print(f"Registered class: {cls.__name__}")
        else:
            print(f"Class {cls.__name__} already registered, skipping")
    except Exception as e:
        print(f"Error registering {cls.__name__}: {e}")
        traceback.print_exc()
```

#### 2. Simplified Registration Process
- Removed redundant registration calls in `__init__.py` and `viewer.py`
- Used `safe_register_class()` to handle class registration
- Ensured each class is registered only once

#### 3. Error Handling
- Added print statements to log registration attempts
- Included traceback for detailed error information
- Prevented duplicate registrations silently

### Benefits
- Prevents Blender addon registration conflicts
- Provides clear logging of registration attempts
- Improves addon stability during reload and enable/disable cycles

### Recommended Usage
1. Install the addon
2. Restart Blender if you encounter any initial issues
3. Report any persistent registration problems

## Troubleshooting
If you still experience registration errors:
- Completely remove the addon from Blender
- Clear Blender's addon cache
- Restart Blender
- Reinstall the addon
