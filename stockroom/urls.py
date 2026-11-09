from django.urls import path
from inventory import views

urlpatterns = [
    path("api/session", views.session),
    path("api/login", views.login),
    path("api/logout", views.logout),
    path("api/dashboard", views.dashboard),
    path("api/products", views.products),
    path("api/products/<int:pk>/adjust", views.adjust),
    path("api/orders", views.orders),
    path("api/orders/<int:pk>/cancel", views.cancel),
    path("api/orders/<int:pk>/ship", views.ship),
    path("api/movements", views.movements),
    path("api/reconciliation", views.reconciliation),
    path("api/reconciliation/<int:pk>/repair", views.repair),
    path("api/intelligence", views.intelligence),
]
