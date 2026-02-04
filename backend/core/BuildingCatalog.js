export const BUILDING_TIERS = {
  1: { minPopulation: 0 },
  2: { minPopulation: 6 },
  3: { minPopulation: 12 },
  4: { minPopulation: 20 }
};

export const BUILDING_CATALOG = [
  // Cafés
  { id: 'cafe-roca', name: 'Café La Roca', type: 'cafe', tier: 1, tags: ['social', 'food'], districts: ['central', 'north'] },
  { id: 'cafe-luna', name: 'Café Luna', type: 'cafe', tier: 1, tags: ['social', 'food'], districts: ['central', 'west'] },
  { id: 'cafe-atelier', name: 'Café Atelier', type: 'cafe', tier: 2, tags: ['social', 'culture'], districts: ['central', 'north'] },
  { id: 'cafe-terraza', name: 'Café Terraza', type: 'cafe', tier: 2, tags: ['social', 'food'], districts: ['south', 'west'] },

  // Bakeries
  { id: 'bakery-panorama', name: 'Panadería Panorama', type: 'bakery', tier: 1, tags: ['food'], districts: ['central', 'west'] },
  { id: 'bakery-miga', name: 'La Miga Dorada', type: 'bakery', tier: 1, tags: ['food'], districts: ['central', 'south'] },
  { id: 'bakery-horno', name: 'Horno Viejo', type: 'bakery', tier: 2, tags: ['food'], districts: ['west', 'south'] },
  { id: 'bakery-lirio', name: 'Panadería Lirio', type: 'bakery', tier: 2, tags: ['food', 'community'], districts: ['north', 'west'] },

  // Restaurants
  { id: 'restaurant-lago', name: 'Restaurante del Lago', type: 'restaurant', tier: 2, tags: ['food', 'social'], districts: ['central', 'north'] },
  { id: 'restaurant-brasa', name: 'Casa Brasa', type: 'restaurant', tier: 2, tags: ['food'], districts: ['south', 'west'] },
  { id: 'restaurant-bambu', name: 'Bambú Urbano', type: 'restaurant', tier: 3, tags: ['food', 'culture'], districts: ['central', 'north'] },
  { id: 'restaurant-azafran', name: 'Azafrán Rojo', type: 'restaurant', tier: 3, tags: ['food', 'culture'], districts: ['north'] },

  // Bars
  { id: 'bar-trovador', name: 'El Trovador', type: 'bar', tier: 2, tags: ['nightlife', 'social'], districts: ['central'] },
  { id: 'bar-faro', name: 'Bar del Faro', type: 'bar', tier: 2, tags: ['nightlife'], districts: ['south'] },
  { id: 'bar-boveda', name: 'La Bóveda', type: 'bar', tier: 3, tags: ['nightlife', 'music'], districts: ['central', 'north'] },
  { id: 'bar-cometa', name: 'Bar Cometa', type: 'bar', tier: 3, tags: ['nightlife'], districts: ['west'] },

  // Libraries
  { id: 'library-azul', name: 'Biblioteca Azul', type: 'library', tier: 1, tags: ['education', 'culture'], districts: ['central', 'north'] },
  { id: 'library-roble', name: 'Biblioteca Roble', type: 'library', tier: 2, tags: ['education'], districts: ['west'] },
  { id: 'library-clara', name: 'Biblioteca Clara', type: 'library', tier: 2, tags: ['education', 'community'], districts: ['south'] },
  { id: 'library-nova', name: 'Biblioteca Nova', type: 'library', tier: 3, tags: ['education', 'research'], districts: ['north'] },

  // Schools
  { id: 'school-prisma', name: 'Escuela Prisma', type: 'school', tier: 1, tags: ['education'], districts: ['central', 'west'] },
  { id: 'school-mar', name: 'Escuela del Mar', type: 'school', tier: 2, tags: ['education'], districts: ['south'] },
  { id: 'school-aurora', name: 'Academia Aurora', type: 'school', tier: 2, tags: ['education', 'community'], districts: ['central', 'north'] },
  { id: 'school-puente', name: 'Colegio Puente', type: 'school', tier: 3, tags: ['education'], districts: ['north'] },

  // Clinics
  { id: 'clinic-sol', name: 'Clínica del Sol', type: 'clinic', tier: 1, tags: ['health'], districts: ['central', 'west'] },
  { id: 'clinic-rio', name: 'Clínica Río Claro', type: 'clinic', tier: 2, tags: ['health'], districts: ['south'] },
  { id: 'clinic-vida', name: 'Centro Vida', type: 'clinic', tier: 2, tags: ['health', 'community'], districts: ['north'] },
  { id: 'clinic-auris', name: 'Clínica Auris', type: 'clinic', tier: 3, tags: ['health'], districts: ['central', 'north'] },

  // Hospitals
  { id: 'hospital-central', name: 'Hospital Central', type: 'hospital', tier: 2, tags: ['health', 'civic'], districts: ['central'] },
  { id: 'hospital-norte', name: 'Hospital del Norte', type: 'hospital', tier: 3, tags: ['health'], districts: ['north'] },
  { id: 'hospital-sur', name: 'Hospital del Sur', type: 'hospital', tier: 3, tags: ['health'], districts: ['south'] },
  { id: 'hospital-vida', name: 'Hospital Vida Nueva', type: 'hospital', tier: 4, tags: ['health', 'research'], districts: ['central', 'north'] },

  // Markets
  { id: 'market-plaza', name: 'Mercado Plaza', type: 'market', tier: 1, tags: ['commerce'], districts: ['central', 'west'] },
  { id: 'market-ronda', name: 'Mercado La Ronda', type: 'market', tier: 2, tags: ['commerce'], districts: ['south'] },
  { id: 'market-atlas', name: 'Mercado Atlas', type: 'market', tier: 2, tags: ['commerce', 'community'], districts: ['north'] },
  { id: 'market-sabores', name: 'Mercado Sabores', type: 'market', tier: 3, tags: ['commerce', 'food'], districts: ['central'] },

  // Shops
  { id: 'shop-alfiler', name: 'Tienda El Alfiler', type: 'shop', tier: 1, tags: ['commerce'], districts: ['central', 'west'] },
  { id: 'shop-nube', name: 'Boutique Nube', type: 'shop', tier: 2, tags: ['commerce', 'fashion'], districts: ['central'] },
  { id: 'shop-aurora', name: 'Tienda Aurora', type: 'shop', tier: 2, tags: ['commerce'], districts: ['south'] },
  { id: 'shop-puerto', name: 'Almacén Puerto', type: 'shop', tier: 3, tags: ['commerce'], districts: ['north'] },

  // Galleries
  { id: 'gallery-oro', name: 'Galería Oro', type: 'gallery', tier: 1, tags: ['culture', 'art'], districts: ['central', 'north'] },
  { id: 'gallery-seda', name: 'Galería Seda', type: 'gallery', tier: 2, tags: ['culture'], districts: ['central'] },
  { id: 'gallery-bosque', name: 'Galería del Bosque', type: 'gallery', tier: 2, tags: ['culture'], districts: ['west'] },
  { id: 'gallery-ocaso', name: 'Galería Ocaso', type: 'gallery', tier: 3, tags: ['culture'], districts: ['north'] },

  // Theaters
  { id: 'theater-via', name: 'Teatro Vía', type: 'theater', tier: 2, tags: ['culture', 'performance'], districts: ['central'] },
  { id: 'theater-eco', name: 'Teatro Eco', type: 'theater', tier: 2, tags: ['culture'], districts: ['north'] },
  { id: 'theater-mar', name: 'Teatro del Mar', type: 'theater', tier: 3, tags: ['culture'], districts: ['south'] },
  { id: 'theater-aurora', name: 'Teatro Aurora', type: 'theater', tier: 3, tags: ['culture', 'performance'], districts: ['central', 'north'] },

  // Museums
  { id: 'museum-tierra', name: 'Museo de la Tierra', type: 'museum', tier: 2, tags: ['culture', 'history'], districts: ['central'] },
  { id: 'museum-luz', name: 'Museo Luz', type: 'museum', tier: 3, tags: ['culture'], districts: ['north'] },
  { id: 'museum-nave', name: 'Museo Nave', type: 'museum', tier: 3, tags: ['science'], districts: ['central', 'north'] },
  { id: 'museum-mar', name: 'Museo del Mar', type: 'museum', tier: 4, tags: ['culture'], districts: ['south'] },

  // Parks
  { id: 'park-alameda', name: 'Parque Alameda', type: 'park', tier: 1, tags: ['nature'], districts: ['central', 'west'] },
  { id: 'park-ribera', name: 'Parque Ribera', type: 'park', tier: 2, tags: ['nature'], districts: ['south'] },
  { id: 'park-nubes', name: 'Parque Nubes', type: 'park', tier: 2, tags: ['nature', 'community'], districts: ['north'] },
  { id: 'park-lagos', name: 'Parque de los Lagos', type: 'park', tier: 3, tags: ['nature'], districts: ['central', 'north'] },

  // Gardens
  { id: 'garden-lirio', name: 'Jardín Lirio', type: 'garden', tier: 1, tags: ['nature'], districts: ['west'] },
  { id: 'garden-zen', name: 'Jardín Zen', type: 'garden', tier: 2, tags: ['nature', 'calm'], districts: ['central', 'north'] },
  { id: 'garden-alba', name: 'Jardín Alba', type: 'garden', tier: 2, tags: ['nature'], districts: ['south'] },
  { id: 'garden-constel', name: 'Jardín Constelación', type: 'garden', tier: 3, tags: ['nature', 'culture'], districts: ['north'] },

  // Gyms
  { id: 'gym-fort', name: 'Gimnasio Fortaleza', type: 'gym', tier: 1, tags: ['fitness'], districts: ['central', 'west'] },
  { id: 'gym-orbita', name: 'Gimnasio Órbita', type: 'gym', tier: 2, tags: ['fitness'], districts: ['central'] },
  { id: 'gym-pulso', name: 'Gimnasio Pulso', type: 'gym', tier: 2, tags: ['fitness'], districts: ['south'] },
  { id: 'gym-ritmo', name: 'Gimnasio Ritmo', type: 'gym', tier: 3, tags: ['fitness', 'community'], districts: ['north'] },

  // Factories
  { id: 'factory-hierro', name: 'Fábrica Hierro', type: 'factory', tier: 2, tags: ['industry'], districts: ['south'] },
  { id: 'factory-lumen', name: 'Fábrica Lumen', type: 'factory', tier: 3, tags: ['industry', 'energy'], districts: ['south'] },
  { id: 'factory-bruma', name: 'Fábrica Bruma', type: 'factory', tier: 3, tags: ['industry'], districts: ['west'] },
  { id: 'factory-nexus', name: 'Fábrica Nexus', type: 'factory', tier: 4, tags: ['industry', 'innovation'], districts: ['south'] },

  // Workshops
  { id: 'workshop-taller', name: 'Taller El Taller', type: 'workshop', tier: 1, tags: ['craft'], districts: ['west'] },
  { id: 'workshop-forja', name: 'Taller La Forja', type: 'workshop', tier: 2, tags: ['craft', 'industry'], districts: ['south', 'west'] },
  { id: 'workshop-puente', name: 'Taller Puente', type: 'workshop', tier: 2, tags: ['craft'], districts: ['central'] },
  { id: 'workshop-estela', name: 'Taller Estela', type: 'workshop', tier: 3, tags: ['craft'], districts: ['north'] },

  // Labs
  { id: 'lab-prisma', name: 'Laboratorio Prisma', type: 'lab', tier: 2, tags: ['research'], districts: ['central', 'north'] },
  { id: 'lab-aurora', name: 'Laboratorio Aurora', type: 'lab', tier: 3, tags: ['research', 'innovation'], districts: ['north'] },
  { id: 'lab-summa', name: 'Laboratorio Summa', type: 'lab', tier: 3, tags: ['research'], districts: ['central'] },
  { id: 'lab-norte', name: 'Laboratorio Norte', type: 'lab', tier: 4, tags: ['research'], districts: ['north'] },

  // Offices
  { id: 'office-zenit', name: 'Oficinas Zénit', type: 'office', tier: 2, tags: ['business'], districts: ['central'] },
  { id: 'office-bulevar', name: 'Centro Bulevar', type: 'office', tier: 2, tags: ['business'], districts: ['central', 'north'] },
  { id: 'office-nexo', name: 'Oficinas Nexo', type: 'office', tier: 3, tags: ['business', 'innovation'], districts: ['north'] },
  { id: 'office-sur', name: 'Oficinas del Sur', type: 'office', tier: 3, tags: ['business'], districts: ['south'] },

  // Banks
  { id: 'bank-aurum', name: 'Banco Aurum', type: 'bank', tier: 2, tags: ['finance'], districts: ['central'] },
  { id: 'bank-rio', name: 'Banco Río', type: 'bank', tier: 3, tags: ['finance'], districts: ['central', 'north'] },
  { id: 'bank-faro', name: 'Banco Faro', type: 'bank', tier: 3, tags: ['finance'], districts: ['north'] },
  { id: 'bank-constel', name: 'Banco Constelación', type: 'bank', tier: 4, tags: ['finance'], districts: ['central'] },

  // Hotels
  { id: 'hotel-marino', name: 'Hotel Marino', type: 'hotel', tier: 2, tags: ['hospitality'], districts: ['central', 'south'] },
  { id: 'hotel-aurora', name: 'Hotel Aurora', type: 'hotel', tier: 3, tags: ['hospitality'], districts: ['central'] },
  { id: 'hotel-brisa', name: 'Hotel Brisa', type: 'hotel', tier: 3, tags: ['hospitality'], districts: ['north'] },
  { id: 'hotel-zen', name: 'Hotel Zen', type: 'hotel', tier: 4, tags: ['hospitality'], districts: ['north'] },

  // Houses
  { id: 'house-alba', name: 'Casa Alba', type: 'house', tier: 1, tags: ['housing'], districts: ['west'] },
  { id: 'house-olivo', name: 'Casa Olivo', type: 'house', tier: 1, tags: ['housing'], districts: ['south'] },
  { id: 'house-prisma', name: 'Casa Prisma', type: 'house', tier: 2, tags: ['housing'], districts: ['central', 'west'] },
  { id: 'house-bosque', name: 'Casa del Bosque', type: 'house', tier: 2, tags: ['housing'], districts: ['north'] },

  // Apartments
  { id: 'apartment-norte', name: 'Apartamentos Norte', type: 'apartment', tier: 2, tags: ['housing'], districts: ['north'] },
  { id: 'apartment-vertical', name: 'Torre Vertical', type: 'apartment', tier: 3, tags: ['housing'], districts: ['central'] },
  { id: 'apartment-rio', name: 'Residencial Río', type: 'apartment', tier: 3, tags: ['housing'], districts: ['south'] },
  { id: 'apartment-luz', name: 'Residencial Luz', type: 'apartment', tier: 4, tags: ['housing'], districts: ['central', 'north'] },

  // Plazas
  { id: 'plaza-circulo', name: 'Plaza Círculo', type: 'plaza', tier: 1, tags: ['public'], districts: ['central', 'west'] },
  { id: 'plaza-luz', name: 'Plaza Luz', type: 'plaza', tier: 2, tags: ['public'], districts: ['central'] },
  { id: 'plaza-mercado', name: 'Plaza del Mercado', type: 'plaza', tier: 2, tags: ['public'], districts: ['south'] },
  { id: 'plaza-altura', name: 'Plaza Altura', type: 'plaza', tier: 3, tags: ['public'], districts: ['north'] }
];

export function getCatalogForPopulation(population) {
  return BUILDING_CATALOG.filter(entry => {
    const tier = BUILDING_TIERS[entry.tier] || BUILDING_TIERS[1];
    return population >= tier.minPopulation;
  });
}

export function filterCatalogByDistrict(catalog, districtId) {
  return catalog.filter(entry => !entry.districts || entry.districts.includes(districtId));
}
