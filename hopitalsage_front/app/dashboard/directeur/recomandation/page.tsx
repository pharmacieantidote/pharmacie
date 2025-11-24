"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Calendar,
  BarChart3,
  AlertTriangle,
  Filter,
  Download,
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function RapportStockPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [selectedCategory, setSelectedCategory] = useState("");
  const rapportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch(
      `http://127.0.0.1:8000/api/rapport-stock/c28e5c34-2f8a-4eb1-863b-d7a55afc1b00/?days=${period}`
    )
      .then((res) => res.json())
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erreur API :", err);
        setLoading(false);
      });
  }, [period]);

  // ✅ Fonction pour générer et télécharger le PDF
  const handleDownloadPDF = async () => {
    if (!rapportRef.current) return;

    const canvas = await html2canvas(rapportRef.current, {
      scale: 2,
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;

    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
    pdf.save(`Rapport_Stock_${selectedCategory || "Tous"}_${period}j.pdf`);
  };

  if (loading)
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Loader2 className="animate-spin text-blue-600 w-10 h-10 mb-4" />
        <p className="text-gray-600">Chargement du rapport...</p>
      </div>
    );

  if (!data)
    return (
      <p className="text-center text-gray-500 mt-10">
        Aucune donnée disponible.
      </p>
    );

  // Comptage des catégories ABC
  const produitsA = data.produits.filter((p: any) => p.categorie === "A").length;
  const produitsB = data.produits.filter((p: any) => p.categorie === "B").length;
  const produitsC = data.produits.filter((p: any) => p.categorie === "C").length;

  // ✅ Filtrage selon la catégorie sélectionnée
  const produitsFiltres =
    selectedCategory === ""
      ? data.produits
      : data.produits.filter((p: any) => p.categorie === selectedCategory);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="min-h-screen bg-gradient-to-br from-blue-50 to-white p-8"
    >
      <div className="max-w-7xl mx-auto" ref={rapportRef}>
        {/* === En-tête === */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <h1 className="text-3xl font-extrabold text-gray-800">
            💊 Rapport STAT {data.pharmacie}
          </h1>

          <div className="flex flex-col sm:flex-row gap-4 mt-4 sm:mt-0">
            {/* Sélecteur de période */}
            <label className="flex items-center gap-2 text-gray-700 font-medium">
              <Calendar className="w-5 h-5 text-blue-500" />
              Période :
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="ml-2 border border-gray-300 rounded-md px-3 py-1 bg-white text-gray-800 focus:ring-2 focus:ring-blue-400 focus:outline-none"
              >
                <option value={7}>7 jours</option>
                <option value={30}>30 jours</option>
                <option value={60}>60 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </label>

            {/* Sélecteur de catégorie */}
            <label className="flex items-center gap-2 text-gray-700 font-medium">
              <Filter className="w-5 h-5 text-blue-500" />
              Catégorie :
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="ml-2 border border-gray-300 rounded-md px-3 py-1 bg-white text-gray-800 focus:ring-2 focus:ring-blue-400 focus:outline-none"
              >
                <option value="">Toutes</option>
                <option value="A">Catégorie A</option>
                <option value="B">Catégorie B</option>
                <option value="C">Catégorie C</option>
              </select>
            </label>

            {/* ✅ Bouton téléchargement PDF */}
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow transition"
            >
              <Download className="w-5 h-5" />
              Télécharger PDF
            </button>
          </div>
        </div>

        {/* === Résumé ABC === */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <SummaryCard
            icon={<BarChart3 className="text-green-600" />}
            title="Catégorie A : Produits stratégiques / forte rotation ✅"
            count={produitsA}
            color="bg-green-50"
          />
          <SummaryCard
            icon={<BarChart3 className="text-yellow-600" />}
            title="Catégorie B : Produits intermédiaires ⚠️"
            count={produitsB}
            color="bg-yellow-50"
          />
          <SummaryCard
            icon={<BarChart3 className="text-red-600" />}
            title="Catégorie C : Faible rotation ❌"
            count={produitsC}
            color="bg-red-50"
          />
        </div>

        {/* === Tableau des produits === */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="overflow-x-auto bg-white shadow-md rounded-2xl border border-gray-100"
        >
          <table className="min-w-full border-collapse">
            <thead className="bg-blue-100 text-blue-800">
              <tr>
                <th className="px-4 py-3 text-left">Produit</th>
                <th className="px-4 py-3 text-center">Stock disponible</th>
                <th className="px-4 py-3 text-center">Ventes totales</th>
                <th className="px-4 py-3 text-center">% Contribution</th>
                <th className="px-4 py-3 text-center">Catégorie</th>
                <th className="px-4 py-3 text-center">Dernière vente</th>
                <th className="px-4 py-3 text-center">Jours sans vente</th>
              </tr>
            </thead>
            <tbody>
              {produitsFiltres.map((item: any, idx: number) => (
                <motion.tr
                  key={idx}
                  whileHover={{ scale: 1.01 }}
                  className="border-b hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-700">
                    {item.nom || "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.stock_disponible ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {item.total_ventes ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-blue-700 font-semibold">
                    {item.pourcentage ?? 0}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        item.categorie === "A"
                          ? "bg-green-100 text-green-700"
                          : item.categorie === "B"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.categorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {item.derniere_vente || "—"}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {item.temps_total_en_officine !== null
                      ? `${item.temps_total_en_officine} j`
                      : "—"}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* === Analyse saisonnière === */}
        {data.seasonal_data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 p-6 bg-gradient-to-br from-indigo-50 to-white border rounded-2xl shadow-sm"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <AlertTriangle className="text-indigo-600" />
              Analyse saisonnière
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-gray-700">
              <p>
                <span className="font-semibold">Moyenne mensuelle :</span>{" "}
                {data.seasonal_data.avg_monthly}
              </p>
              <p>
                <span className="font-semibold">Pic mensuel :</span>{" "}
                {data.seasonal_data.max_month}
              </p>
              <p>
                <span className="font-semibold">Multiplicateur :</span>{" "}
                {data.seasonal_data.multiplier}
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function SummaryCard({
  icon,
  title,
  count,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  color: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`flex items-center gap-4 p-4 rounded-2xl shadow-sm ${color}`}
    >
      <div className="p-3 bg-white rounded-full shadow">{icon}</div>
      <div>
        <p className="text-sm text-gray-600">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{count}</p>
      </div>
    </motion.div>
  );
}
