import os
import time

from django.contrib import messages
from django.core.files.storage import default_storage
from django.shortcuts import redirect, render

from .processes import run_loach_process


def index(request):
    if request.method == "GET":
        return render(
            request,
            "html-pages/home.html",
        )
    
    elif request.method == "POST":
        # Check if file is attached
        image_file_key = "image-input-file"
        if image_file_key not in request.FILES:
            messages.add_message(request, messages.ERROR, "You didn't upload an image")
            return redirect("eleraffe:home")
        
        # Get file data
        image_object = request.FILES[image_file_key]
        image_file_name, image_file_extension = os.path.splitext(image_object.name)
        image_file_name_string = f"{time.time_ns()}{image_file_extension}"

        # Check if it's a supported filetype
        image_file_types_allowed = ["image/jpeg","image/png","image/jpg"]
        image_file_type = image_object.content_type
        if image_object.content_type not in image_file_types_allowed:
            messages.add_message(
                request,
                messages.ERROR,
                f"Unsupported file type: {image_file_type} - {image_file_name}{image_file_extension}",
            )
            return redirect("eleraffe:home")

        # Save image locally
        if not default_storage.exists(image_file_name_string):
            image_path_local = default_storage.save(image_file_name_string, image_object)

        else:
            image_path_local = image_file_name_string

        # Run local process
        try:
            result = run_loach_process(default_storage.path(image_path_local))
            url = default_storage.url(image_file_name_string)
        except Exception as exc:
            messages.add_message(request, messages.ERROR, str(exc))
            result = ""
            url = ""

        return render(
            request,
            "html-pages/upload-result.html",
            {"result": result, "url": url},
        )
