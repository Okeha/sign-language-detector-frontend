from django.urls import path

from . import views

app_name = "eleraffe"
urlpatterns = [
    path("", views.index, name="home"),
]