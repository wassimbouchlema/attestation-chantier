from unittest.mock import patch

from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from comptes.models import Role, Utilisateur

from ..models import (
    DecisionDemande, Demande, DemandeComplement, FormulaireRisque,
    Notification, StatutDemande, TypeNotification,
)


class SiegeTraitementTests(APITestCase):
    def setUp(self):
        self.distributeur = Utilisateur.objects.create_user(username="distributeur", role=Role.DISTRIBUTEUR)
        self.siege = Utilisateur.objects.create_user(username="siege", role=Role.SIEGE)
        self.demande = Demande.objects.create(distributeur=self.distributeur, statut=StatutDemande.EN_COURS)
        FormulaireRisque.objects.create(demande=self.demande, assure_nom="Assuré initial")
        self.client.force_authenticate(self.siege)

    def poster(self, action, donnees):
        return self.client.post(f"/api/siege/demandes/{self.demande.pk}/{action}/", donnees, format="json")

    def verifier_notification(self, type_notification, message):
        notification = Notification.objects.get()
        self.assertEqual(notification.destinataire, self.distributeur)
        self.assertEqual(notification.demande, self.demande)
        self.assertEqual(notification.type_notification, type_notification)
        self.assertEqual(notification.message, message)
        self.assertIsNone(notification.seen_at)

    def test_complement_valide_et_detail_distributeur(self):
        response = self.poster("demander-complements", {"message": "  Merci de préciser les travaux. \n"})
        self.assertEqual(response.status_code, 201)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertIsNone(self.demande.decision)
        complement = DemandeComplement.objects.get(demande=self.demande)
        self.assertEqual(complement.message, "Merci de préciser les travaux.")
        self.assertIsNone(complement.received_at)
        self.assertIsNotNone(complement.requested_at)
        self.assertEqual(response.data["complement_actif"]["id"], str(complement.id))
        self.assertTrue(response.data["complement_actif"]["requested_at"])
        self.assertEqual(self.demande.fdr.assure_nom, "Assuré initial")
        self.assertFalse(self.demande.pieces.exists())
        self.verifier_notification(TypeNotification.COMPLEMENTS_DEMANDES, complement.message)
        self.client.force_authenticate(self.distributeur)
        detail = self.client.get(reverse("demande-detail", kwargs={"pk": self.demande.pk}))
        self.assertEqual(detail.data["complement_actif"], response.data["complement_actif"])

    def test_deuxieme_complement_actif(self):
        self.poster("demander-complements", {"message": "Premier message"})
        response = self.poster("demander-complements", {"message": "Autre message"})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "COMPLEMENTS_DEJA_DEMANDES")
        self.assertEqual(DemandeComplement.objects.count(), 1)
        self.assertEqual(Notification.objects.count(), 1)

    def test_textes_obligatoires(self):
        for action, champ in (("demander-complements", "message"), ("refuser", "motif")):
            for donnees in ({}, {champ: ""}, {champ: " \n\t "}, {champ: None}):
                with self.subTest(action=action, donnees=donnees):
                    self.assertEqual(self.poster(action, donnees).status_code, 400)
        self.assertFalse(DemandeComplement.objects.exists())
        self.assertFalse(Notification.objects.exists())
        self.demande.refresh_from_db()
        self.assertIsNone(self.demande.decision)
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)

    def test_refus_valide_et_retrait_liste(self):
        response = self.poster("refuser", {"motif": "  Risque non couvert. \n"})
        self.assertEqual(response.status_code, 200)
        self.demande.refresh_from_db()
        self.assertEqual(self.demande.decision, DecisionDemande.REFUSEE)
        self.assertEqual(self.demande.statut, StatutDemande.TRAITE)
        self.assertEqual(self.demande.motif_refus, "Risque non couvert.")
        self.assertEqual(response.data["decision"], DecisionDemande.REFUSEE)
        self.assertEqual(response.data["motif_refus"], self.demande.motif_refus)
        self.verifier_notification(TypeNotification.DEMANDE_REFUSEE, self.demande.motif_refus)
        self.assertEqual(self.client.get("/api/siege/demandes/").data["count"], 0)

    def test_refus_bloque_par_complement_actif(self):
        DemandeComplement.objects.create(demande=self.demande, message="Précisions ?")
        response = self.poster("refuser", {"motif": "Refus"})
        self.assertEqual(response.status_code, 409)
        self.demande.refresh_from_db()
        self.assertIsNone(self.demande.decision)
        self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
        self.assertEqual(self.demande.motif_refus, "")
        self.assertFalse(Notification.objects.exists())

    def test_complement_recu_ne_bloque_pas_le_traitement(self):
        ancien = DemandeComplement.objects.create(demande=self.demande, message="Ancien", received_at=timezone.now())
        response = self.poster("demander-complements", {"message": "Nouveau"})
        self.assertEqual(response.status_code, 201)
        self.assertNotEqual(response.data["complement_actif"]["id"], str(ancien.id))
        DemandeComplement.objects.filter(received_at__isnull=True).update(received_at=timezone.now())
        self.assertEqual(self.poster("refuser", {"motif": "Refus motivé"}).status_code, 200)

    def test_contrainte_unicite_complement_actif(self):
        DemandeComplement.objects.create(demande=self.demande, message="Premier")
        with self.assertRaises(IntegrityError), transaction.atomic():
            DemandeComplement.objects.create(demande=self.demande, message="Deuxième")

    def test_etats_non_traitables(self):
        for statut, decision in (
            (StatutDemande.BROUILLON, None),
            (StatutDemande.TRAITE, DecisionDemande.REFUSEE),
            (StatutDemande.EN_COURS, DecisionDemande.ACCEPTEE),
        ):
            self.demande.statut, self.demande.decision = statut, decision
            self.demande.save()
            for action, donnees in (("demander-complements", {"message": "Texte"}), ("refuser", {"motif": "Texte"})):
                with self.subTest(statut=statut, decision=decision, action=action):
                    self.assertEqual(self.poster(action, donnees).status_code, 409)
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(DemandeComplement.objects.exists())

    def test_permissions_distributeur_et_anonyme(self):
        for utilisateur, attendu in ((self.distributeur, 403), (None, 401)):
            self.client.force_authenticate(utilisateur)
            for action, donnees in (("demander-complements", {"message": "Texte"}), ("refuser", {"motif": "Texte"})):
                with self.subTest(utilisateur=utilisateur, action=action):
                    self.assertEqual(self.poster(action, donnees).status_code, attendu)
        self.assertFalse(Notification.objects.exists())
        self.assertFalse(DemandeComplement.objects.exists())

    def test_echec_notification_annule_le_traitement(self):
        for action, donnees in (("demander-complements", {"message": "Texte"}), ("refuser", {"motif": "Texte"})):
            with self.subTest(action=action):
                with patch("demandes.views.Notification.objects.create", side_effect=RuntimeError("Indisponible")):
                    with self.assertRaises(RuntimeError):
                        self.poster(action, donnees)
                self.demande.refresh_from_db()
                self.assertEqual(self.demande.statut, StatutDemande.EN_COURS)
                self.assertIsNone(self.demande.decision)
                self.assertFalse(DemandeComplement.objects.exists())
