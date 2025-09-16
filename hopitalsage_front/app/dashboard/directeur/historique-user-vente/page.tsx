'use client';

import { useEffect, useState, useMemo } from 'react';

interface VenteLigne {
  produit: string;
  quantite: number;
  prix_unitaire: string;
  total: string;
}

interface Vente {
  id: number;
  date_vente: string;
  utilisateur: string | null;
  client: string | null;
  montant_total: string;
  lignes: VenteLigne[];
}

interface VenteRegroupee {
  [utilisateur: string]: {
    [mois: string]: {
      ventes: Vente[];
      total: number;
    };
  };
}

const moisNoms = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

export default function HistoriqueVentes() {
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  const fetchVentes = () => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setError('Token d’accès manquant.');
      setLoading(false);
      return;
    }

    let url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/historique-ventes/`;
    const params = new URLSearchParams();

    if (dateDebut) params.append('date_debut', dateDebut);
    if (dateFin) params.append('date_fin', dateFin);

    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    setLoading(true);
    setError(null);

    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}: Impossible de charger les données`);
        }
        return res.json();
      })
      .then((data) => {
        // ✅ Correction clé : extraire data.ventes
        if (data && Array.isArray(data.ventes)) {
          setVentes(data.ventes); // ← data.ventes contient le tableau
        } else {
          console.error("La réponse de l'API ne contient pas de tableau 'ventes':", data);
          setVentes([]);
          setError("Aucune vente trouvée ou format de réponse invalide.");
        }
      })
      .catch((err) => {
        console.error('Erreur lors du chargement des ventes:', err);
        setError(err.message || 'Erreur réseau ou serveur');
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchVentes();
  }, []);

  // 🔐 Regroupement sécurisé avec useMemo
  const ventesParUtilisateurEtMois = useMemo(() => {
    const result: VenteRegroupee = {};

    // ✅ Vérifie que ventes est bien un tableau
    if (!Array.isArray(ventes)) {
      console.warn('ventes n’est pas un tableau:', ventes);
      return result;
    }

    ventes.forEach((vente) => {
      const utilisateur = vente.utilisateur || 'Inconnu';
      const date = new Date(vente.date_vente);
      const mois = `${moisNoms[date.getMonth()]} ${date.getFullYear()}`;

      if (!result[utilisateur]) {
        result[utilisateur] = {};
      }
      if (!result[utilisateur][mois]) {
        result[utilisateur][mois] = { ventes: [], total: 0 };
      }

      result[utilisateur][mois].ventes.push(vente);
      const montant = parseFloat(vente.montant_total);
      result[utilisateur][mois].total += isNaN(montant) ? 0 : montant;
    });

    return result;
  }, [ventes]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Historique des Ventes par Mois et Utilisateur</h2>

      <div className="flex items-center gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Date début</label>
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="mt-1 border px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-300"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Date fin</label>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="mt-1 border px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-300"
          />
        </div>
        <button
          onClick={fetchVentes}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 self-end transition"
        >
          Rechercher
        </button>
      </div>

      {loading && <p className="text-blue-600">Chargement des ventes...</p>}
      {error && <p className="text-red-500 font-medium">❌ {error}</p>}

      {!loading && Object.keys(ventesParUtilisateurEtMois).length === 0 && (
        <p className="text-gray-500">Aucune vente trouvée pour cette période.</p>
      )}

      {/* Affichage groupé */}
      {Object.entries(ventesParUtilisateurEtMois).map(([utilisateur, moisData]) => (
        <div key={utilisateur} className="mb-10">
          <h3 className="text-xl font-semibold text-green-700 mb-3 border-b pb-1">
            {utilisateur}
          </h3>

          {Object.entries(moisData).map(([mois, data]) => (
            <div key={mois} className="bg-white rounded-lg shadow-sm border p-5 mb-5">
              <h4 className="font-semibold text-lg text-blue-600 mb-3">{mois}</h4>

              {data.ventes.map((vente) => (
                <div key={vente.id} className="border rounded-lg p-4 mb-4 bg-gray-50">
                  <p className="text-sm text-gray-700 mb-1">
                    <strong>Date :</strong>{' '}
                    {new Date(vente.date_vente).toLocaleDateString('fr-FR')} à{' '}
                    {new Date(vente.date_vente).toLocaleTimeString('fr-FR')}
                  </p>
                  {vente.client && (
                    <p className="text-sm text-gray-700 mb-1">
                      <strong>Client :</strong> {vente.client}
                    </p>
                  )}
                  <p className="text-sm font-medium mb-2">
                    <strong>Montant total :</strong> {vente.montant_total} Fc
                  </p>

                  <table className="w-full text-sm border-collapse border border-gray-300 mt-2">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-3 py-2 text-left">Produit</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">Quantité</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">Prix U.</th>
                        <th className="border border-gray-300 px-3 py-2 text-left">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vente.lignes.map((ligne, index) => (
                        <tr key={index}>
                          <td className="border border-gray-300 px-3 py-2">{ligne.produit}</td>
                          <td className="border border-gray-300 px-3 py-2">{ligne.quantite}</td>
                          <td className="border border-gray-300 px-3 py-2">{ligne.prix_unitaire} Fc</td>
                          <td className="border border-gray-300 px-3 py-2">{ligne.total} Fc</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

              <p className="font-bold text-right text-green-800 mt-3">
                Total {mois} : {data.total.toLocaleString()} Fc
              </p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}