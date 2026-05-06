/**
 * Mekanları ilgi alanı, bütçe ve puana göre filtrele ve gün sayısına böl.
 */
function filterPlaces(places, { days }) {
  let filtered = [...places];

  // Puana göre sırala (yüksekten düşüğe)
  filtered.sort((a, b) => {
    const scoreA = a.rating * Math.log10(a.userRatingsTotal + 1);
    const scoreB = b.rating * Math.log10(b.userRatingsTotal + 1);
    return scoreB - scoreA;
  });

  // Gün başına 3-4 mekan olacak şekilde sınırla
  const maxPlaces = days * 4;
  filtered = filtered.slice(0, maxPlaces);

  return filtered;
}

/**
 * Restoranları bütçe ve puana göre filtrele.
 */
function filterRestaurants(restaurants, { budget, days }) {
  let filtered = [...restaurants];

  // Bütçeye göre filtrele
  if (budget === 'low') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 1);
  } else if (budget === 'medium') {
    filtered = filtered.filter((r) => r.priceLevel === null || r.priceLevel <= 2);
  }
  // high ise filtre yok

  // Puana göre sırala
  filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  // Gün başına 2 restoran (öğle + akşam)
  const maxRestaurants = days * 2;
  filtered = filtered.slice(0, maxRestaurants);

  return filtered;
}

module.exports = {
  filterPlaces,
  filterRestaurants,
};
