"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Head from "next/head";
import { pdf } from "@react-pdf/renderer";
import ContractPDF from "@/components/pdf/ContractPDF";
import QRCode from "qrcode";

export default function CreerPharmacie() {
  const router = useRouter();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pharmacieCreee, setPharmacieCreee] = useState<any>(null);

  const [formData, setFormData] = useState({
    nom_pharm: "",
    ville_pharm: "",
    commune_pharm: "",
    adresse_pharm: "",
    rccm: "",
    idnat: "",
    ni: "",
    telephone: "",
    montant_mensuel: "",
    latitude: -1.2921,
    longitude: 36.8219,
    date_expiration: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = localStorage.getItem("accessToken");
    if (!token || token === "undefined" || token === "null") {
      alert("Votre session a expiré. Veuillez vous reconnecter.");
      router.push("/login");
      return;
    }

    if (!formData.date_expiration) {
      const today = new Date();
      today.setDate(today.getDate() + 30);
      formData.date_expiration = today.toISOString().split("T")[0];
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => data.append(key, String(value)));
    if (logoFile) data.append("logo_pharm", logoFile);

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/pharmacies/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });

      if (response.ok) {
        const data = await response.json();
        setPharmacieCreee(data);
        alert("Pharmacie créée avec succès !");
      } else {
        const error = await response.json();
        console.error("Erreur serveur:", error);
        if (error?.code === "token_not_valid") {
          alert("Votre session est expirée. Veuillez vous reconnecter.");
          router.push("/login");
        }
      }
    } catch (error) {
      console.error("Erreur création:", error);
    }
  };

  const genererPDF = async () => {
    if (!pharmacieCreee) return alert("Veuillez d'abord créer la pharmacie.");

    try {
      const qrData = JSON.stringify({
        nom_pharm: pharmacieCreee.nom_pharm,
        ni: pharmacieCreee.ni,
        date_expiration: pharmacieCreee.date_expiration,
      });
      const qrCodeDataUrl = await QRCode.toDataURL(qrData);

      const blob = await pdf(<ContractPDF pharmacie={pharmacieCreee} qrCode={qrCodeDataUrl} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Contrat_${pharmacieCreee.nom_pharm}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Erreur génération PDF:", err);
      alert("Impossible de générer le PDF. Voir la console pour détails.");
    }
  };

  return (
    <>
      <Head>
        <title>Créer une Pharmacie</title>
      </Head>
      <div className="max-w-3xl mx-auto p-6 bg-white rounded-lg shadow-lg mt-10">
        <h1 className="text-2xl font-bold text-emerald-700 mb-6">Nouvelle Pharmacie</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { name: "nom_pharm", placeholder: "Nom de la pharmacie" },
            { name: "ville_pharm", placeholder: "Ville" },
            { name: "commune_pharm", placeholder: "Commune/Arrondissement" },
            { name: "adresse_pharm", placeholder: "Adresse détaillée", type: "textarea" },
            { name: "rccm", placeholder: "Numéro RCCM" },
            { name: "idnat", placeholder: "Numéro IDNAT" },
            { name: "ni", placeholder: "Numéro National" },
            { name: "telephone", placeholder: "Téléphone" },
          ].map((field) =>
            field.type === "textarea" ? (
              <textarea
                key={field.name}
                name={field.name}
                value={(formData as any)[field.name]}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                className="w-full p-3 border rounded-lg"
                placeholder={field.placeholder}
                required
                rows={3}
              />
            ) : (
              <input
                key={field.name}
                type="text"
                name={field.name}
                value={(formData as any)[field.name]}
                onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                className="w-full p-3 border rounded-lg"
                placeholder={field.placeholder}
                required
              />
            )
          )}

          <input
            type="number"
            step="0.01"
            name="montant_mensuel"
            value={formData.montant_mensuel}
            onChange={(e) => setFormData({ ...formData, montant_mensuel: e.target.value })}
            className="w-full p-3 border rounded-lg"
            placeholder="Montant mensuel à payer"
            required
          />

          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700">Date d'expiration (optionnelle)</label>
            <input
              type="date"
              name="date_expiration"
              value={formData.date_expiration}
              onChange={(e) => setFormData({ ...formData, date_expiration: e.target.value })}
              className="w-full p-3 border rounded-lg"
            />
            <p className="text-xs text-gray-500 mt-1">
              Si vide, la date sera définie automatiquement à 30 jours après aujourd’hui.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Logo de la pharmacie</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0 file:text-sm file:font-semibold
                file:bg-emerald-100 file:text-emerald-700 hover:file:bg-emerald-200"
            />
          </div>

          <div className="text-sm text-gray-500">
            📍 Position utilisée : Latitude {formData.latitude} / Longitude {formData.longitude}
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition"
          >
            Créer la pharmacie
          </button>
        </form>

        {pharmacieCreee && (
          <button
            onClick={genererPDF}
            className="w-full mt-4 bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition"
          >
            Télécharger le contrat PDF moderne
          </button>
        )}
      </div>
    </>
  );
}
