from rest_framework.pagination import PageNumberPagination


class DemandePagination(PageNumberPagination):
    page_size = 10
