from django.http import HttpResponse


class HealthCheckMiddleware:
    """Répond aux probes Azure avant la validation d'ALLOWED_HOSTS (Host = IP du conteneur)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.path == '/healthz':
            return HttpResponse('ok', content_type='text/plain')
        return self.get_response(request)
