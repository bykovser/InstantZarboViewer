def op_kwargs(op, **kwargs):
    """Drop kwargs the operator doesn't know: exporter options differ between Blender 4.2 and 5.x."""
    known = {p.identifier for p in op.get_rna_type().properties}
    return {k: v for k, v in kwargs.items() if k in known}


def has_selection(context) -> bool:
    return any(obj.select_get() for obj in context.view_layer.objects)
