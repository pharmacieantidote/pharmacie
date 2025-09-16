'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface ProduitFabricant {
  id: number;
  nom: string;
  fabricant_nom: string;
}

export default function MedicamentsPage() {
  const [produits, setProduits] = useState<ProduitFabricant[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const accessToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const API = process.env.NEXT_PUBLIC_API_BASE_URL;
  const PAGE_SIZE = 30;

  // 🔎 Recherche dynamique
  useEffect(() => {
    if (!searchTerm.trim()) {
      setProduits([]);
      return;
    }

    const delayDebounce = setTimeout(() => {
      setIsLoading(true);
      axios
        .get(`${API}/api/produits-fabricants/?search=${searchTerm}&page_size=${PAGE_SIZE}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        .then((res) => setProduits(res.data.results || []))
        .catch((err) => console.error("Erreur recherche :", err))
        .finally(() => setIsLoading(false));
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [searchTerm]);

  // 🗑️ Suppression
  const supprimerProduit = async (id: number) => {
    if (!accessToken) return;

    if (confirm("Voulez-vous vraiment supprimer ce médicament ?")) {
      try {
        await axios.delete(`${API}/api/produits-fabricants/${id}/`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        setProduits((prev) => prev.filter((p) => p.id !== id));
      } catch (error) {
        console.error("Erreur suppression médicament :", error);
        alert("Échec de la suppression.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-green-700 mb-6">Gestion des Médicaments</h1>

      <input
        type="text"
        placeholder="🔍 Rechercher un médicament..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full p-3 border rounded mb-6"
      />

      {isLoading && <p>Chargement...</p>}

      {produits.length > 0 ? (
        <div className="space-y-3">
          {produits.map((p) => (
            <div
              key={p.id}
              className="flex justify-between items-center bg-white shadow p-4 rounded border hover:bg-gray-50"
            >
              <div>
                <p className="font-semibold text-lg">{p.nom}</p>
                <p className="text-sm text-gray-600">Fabricant : {p.fabricant_nom || "Non spécifié"}</p>
              </div>
              <button
                onClick={() => supprimerProduit(p.id)}
                className="text-red-600 hover:text-red-800 font-medium"
              >
                🗑️ Supprimer
              </button>
            </div>
          ))}
        </div>
      ) : (
        !isLoading && <p className="text-gray-600">Aucun médicament trouvé.</p>
      )}
    </div>
  );
}
