'use client'

import React, { useEffect, useState, useCallback } from 'react'

interface Fabricant {
  id: number
  nom: string
}

interface Produit {
  id: string
  nom: string
  prix_achat: number
  devise: string
  nombre_plaquettes_par_boite: number
  fabricant_nom?: string
}

interface User {
  id: number
  username: string
  first_name: string
  last_name: string
  email: string
  photo: string | null
  role: string
}

interface Message {
  text: string
  type: 'success' | 'error' | 'warning'
}

interface Modification {
  prix_achat?: number
  nombre_plaquettes_par_boite?: number
  nom?: string
}

const Page = () => {
  const [fabricants, setFabricants] = useState<Fabricant[]>([])
  const [produits, setProduits] = useState<Produit[]>([])
  const [produitsOriginaux, setProduitsOriginaux] = useState<Produit[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [modifications, setModifications] = useState<Record<string, Modification>>({})
  const [fabricantSelectionne, setFabricantSelectionne] = useState<string | null>(null)
  const [message, setMessage] = useState<Message | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSearching, setIsSearching] = useState<boolean>(false)

  const [userData, setUserData] = useState<User | null>(null)
  const [loadingUser, setLoadingUser] = useState(true)

  useEffect(() => {
    const storedUser = localStorage.getItem('user')
    if (storedUser) setUserData(JSON.parse(storedUser))
    setLoadingUser(false)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    setAccessToken(token)

    if (token) {
      fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/api/fabricants/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setFabricants(data)
          else if (data.results) setFabricants(data.results)
          else setFabricants([])
        })
        .catch(() => setFabricants([]))
    }
  }, [])

  // Recherche produit
  const rechercherProduits = useCallback(async (term: string, fabricantId: string | null) => {
    if (!accessToken) return

    setIsSearching(true)
    try {
      let url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/produits-fabricants/`

      const params = new URLSearchParams()
      if (term.trim()) params.append('search', term.trim())
      if (fabricantId) params.append('fabricant', fabricantId)
      params.append('page_size', '50')

      if (params.toString()) url += `?${params.toString()}`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })

      if (!response.ok) throw new Error('Erreur recherche')

      const data = await response.json()

      const produitsConvertis: Produit[] = (data.results || []).map((item: any) => ({
        id: item.id,
        nom: item.nom,
        prix_achat: item.prix_achat,
        devise: item.devise || 'USD',
        nombre_plaquettes_par_boite: item.nombre_plaquettes_par_boite,
        fabricant_nom: item.fabricant_nom,
      }))

      setProduits(produitsConvertis)

      if (fabricantId && !term.trim()) setProduitsOriginaux(produitsConvertis)
    } catch {
      setProduits([])
    } finally {
      setIsSearching(false)
    }
  }, [accessToken])

  const handleFabricantChange = async (fabricantId: string) => {
    setFabricantSelectionne(fabricantId)
    setSearchTerm('')
    setProduits([])
    setProduitsOriginaux([])
    setModifications({})

    if (fabricantId) {
      setIsLoading(true)
      await rechercherProduits('', fabricantId)
      setIsLoading(false)
    }
  }

  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value
    setSearchTerm(term)

    setIsSearching(true)
    setTimeout(async () => {
      await rechercherProduits(term, fabricantSelectionne)
      setIsSearching(false)
    }, 300)
  }

  const handleInputChange = (produitId: string, field: keyof Modification, value: any) => {
    setModifications(prev => ({
      ...prev,
      [produitId]: { ...prev[produitId], [field]: value },
    }))
  }

  const estModifie = (produit: Produit): boolean => {
    const modif = modifications[produit.id]
    if (!modif) return false
    return (
      (modif.nom !== undefined && modif.nom !== produit.nom) ||
      (modif.prix_achat !== undefined && modif.prix_achat !== produit.prix_achat) ||
      (modif.nombre_plaquettes_par_boite !== undefined &&
        modif.nombre_plaquettes_par_boite !== produit.nombre_plaquettes_par_boite)
    )
  }

  const preparerDonneesPourBackend = (updates: Modification) => {
    const donnees: any = {}

    if (updates.nom !== undefined) donnees.nom = updates.nom.toString().trim()
    if (updates.prix_achat !== undefined) donnees.prix_achat = parseFloat(updates.prix_achat.toString()).toFixed(2)
    if (updates.nombre_plaquettes_par_boite !== undefined)
      donnees.nombre_plaquettes_par_boite = parseInt(updates.nombre_plaquettes_par_boite.toString())

    return donnees
  }

  const sauvegarderPrix = async () => {
    if (!accessToken) return

    const modificationsEntries = Object.entries(modifications)
    const results: any[] = []

    for (const [produitId, updates] of modificationsEntries) {
      try {
        const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/produit/${produitId}/modifier/`
        const payload = preparerDonneesPourBackend(updates)

        if (Object.keys(payload).length === 0) continue

        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!res.ok) throw new Error(`Erreur ${res.status}`)

        setProduits(prev =>
          prev.map(p =>
            p.id === produitId ? { ...p, ...updates } : p
          )
        )

        setProduitsOriginaux(prev =>
          prev.map(p =>
            p.id === produitId ? { ...p, ...updates } : p
          )
        )

        results.push({ produitId, success: true })
      } catch (error: any) {
        results.push({ produitId, success: false, error: error.message })
      }
    }

    const successCount = results.filter(r => r.success).length
    const errorCount = results.length - successCount

    if (successCount > 0) {
      const doneIds = results.filter(r => r.success).map(r => r.produitId)
      setModifications(prev => {
        const newState = { ...prev }
        doneIds.forEach(id => delete newState[id])
        return newState
      })

      setMessage({
        text: `✅ ${successCount} produit(s) mis à jour avec succès`,
        type: 'success',
      })
    }

    if (errorCount > 0) {
      setMessage(prev => {
        const previous = prev?.text ?? ""
        const separator = previous ? "<br/>" : ""

        return {
          text: `${previous}${separator}❌ ${errorCount} erreur(s) lors de la mise à jour`,
          type: errorCount === modificationsEntries.length ? "error" : "warning",
        }
      })
    }

    setTimeout(() => setMessage(null), 6000)
  }

  // AFFICHAGE

  if (loadingUser)
    return <div className="flex justify-center items-center min-h-screen">Chargement utilisateur...</div>

  if (!userData)
    return <div className="flex justify-center items-center min-h-screen text-red-600">Erreur utilisateur</div>

  return (
    <main className="p-6 md:p-10 bg-gradient-to-br from-blue-50 to-white min-h-screen">
      <div className="max-w-5xl mx-auto">

        {/* ALERTES */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-md shadow border ${
              message.type === 'success'
                ? 'bg-green-100 border-green-300 text-green-800'
                : message.type === 'error'
                ? 'bg-red-100 border-red-300 text-red-800'
                : 'bg-yellow-100 border-yellow-300 text-yellow-800'
            }`}
            dangerouslySetInnerHTML={{ __html: message.text }}
          />
        )}

        {/* SELECT FABRICANT */}
        <div className="mb-8">
          <label className="block text-gray-700 font-medium mb-2">Sélectionner un fabricant</label>
          <select
            onChange={(e) => handleFabricantChange(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- Choisir --</option>
            {fabricants.map((fab) => (
              <option key={fab.id} value={fab.id}>{fab.nom}</option>
            ))}
          </select>
        </div>

        {fabricantSelectionne && (
          <>
            {/* RECHERCHE */}
            <div className="mb-6">
              <label className="block text-gray-700 font-medium mb-2">🔍 Rechercher un produit</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  placeholder="Tapez un nom de médicament..."
                  className="w-full p-3 pl-10 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <div className="absolute left-3 top-3.5 text-gray-400">
                  {isSearching ? '⌛' : '🔍'}
                </div>
              </div>
            </div>

            {/* PRODUITS */}
            {isLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-gray-600">Chargement des produits...</p>
              </div>
            ) : (
              <>
                <div className="space-y-6">
                  {produits.length === 0 ? (
                    <p className="text-center text-gray-500 italic py-8">
                      {searchTerm ? 'Aucun produit trouvé' : 'Aucun produit à afficher'}
                    </p>
                  ) : (
                    produits.map((produit) => {
                      const isModifie = estModifie(produit)
                      return (
                        <div
                          key={produit.id}
                          className={`p-5 rounded-xl shadow transition duration-200 ${
                            isModifie
                              ? 'bg-green-50 border-2 border-green-300'
                              : 'bg-white border border-gray-200'
                          }`}
                        >
                          {produit.fabricant_nom && (
                            <div className="mb-2 text-sm text-gray-500">
                              Fabricant: {produit.fabricant_nom}
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                              <label className="block text-sm text-gray-600">Nom du médicament</label>
                              <input
                                type="text"
                                defaultValue={produit.nom}
                                onChange={(e) =>
                                  handleInputChange(produit.id, 'nom', e.target.value)
                                }
                                className="w-full border border-gray-300 rounded-lg px-4 py-2 mt-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm text-gray-600">
                                Prix d'achat ({produit.devise})
                              </label>
                              <input
                                type="number"
                                defaultValue={produit.prix_achat}
                                step="0.01"
                                onChange={(e) =>
                                  handleInputChange(
                                    produit.id,
                                    'prix_achat',
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="w-full border border-gray-300 rounded-lg px-4 py-2 mt-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>

                            <div>
                              <label className="block text-sm text-gray-600">Plaquettes/boîte</label>
                              <input
                                type="number"
                                min="1"
                                defaultValue={produit.nombre_plaquettes_par_boite}
                                onChange={(e) =>
                                  handleInputChange(
                                    produit.id,
                                    'nombre_plaquettes_par_boite',
                                    parseInt(e.target.value) || 1
                                  )
                                }
                                className="w-full border border-gray-300 rounded-lg px-4 py-2 mt-1 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>

                          {isModifie && (
                            <div className="mt-3 text-sm text-green-600 font-medium">
                              ✏️ Modifié - Non sauvegardé
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {/* SAVE BAR FIXE */}
                {produits.length > 0 && Object.keys(modifications).length > 0 && (
                  <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg sticky bottom-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                      <div>
                        <p className="font-medium text-blue-800">
                          💾 {Object.keys(modifications).length} modification(s) en attente
                        </p>
                        <p className="text-sm text-blue-600">
                          Cliquez sur "Sauvegarder" pour enregistrer les changements
                        </p>
                      </div>

                      <button
                        onClick={sauvegarderPrix}
                        className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg shadow transition-colors"
                      >
                        💾 Sauvegarder les modifications
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default Page
