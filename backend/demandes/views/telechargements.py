from django.http import FileResponse
from rest_framework import status
from rest_framework.response import Response


def reponse_fdr_pdf(demande):
    if not demande.fdr_pdf:
        return Response({"detail": "Aucun document généré pour cette demande."}, status=status.HTTP_404_NOT_FOUND)

    return FileResponse(
        demande.fdr_pdf.open("rb"),
        content_type="application/pdf",
        as_attachment=False,
        filename=f"FDR-{demande.id}.pdf",
    )
