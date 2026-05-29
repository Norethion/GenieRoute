// TripForm ve PreferencesPage ortak kullanır — ilgi alanı / yoğunluk / ulaşım
// seçenek listeleri. İkon olarak lucide-react bileşenleri taşır.
import {
  Landmark, UtensilsCrossed, TreePine, Palette, ShoppingBag, Moon,
  Drama, BookOpen, Waves, Droplets, Coffee, Mountain,
  Compass, Footprints, Bus, Car, Shuffle, Zap, Battery,
} from 'lucide-react';

export const INTEREST_OPTIONS = [
  { value: 'history', key: 'history', icon: Landmark },
  { value: 'food', key: 'food', icon: UtensilsCrossed },
  { value: 'nature', key: 'nature', icon: TreePine },
  { value: 'museum', key: 'museum', icon: Palette },
  { value: 'shopping', key: 'shopping', icon: ShoppingBag },
  { value: 'nightlife', key: 'nightlife', icon: Moon },
  { value: 'art', key: 'art', icon: Drama },
  { value: 'culture', key: 'culture', icon: BookOpen },
  { value: 'beach', key: 'beach', icon: Waves },
  { value: 'thermal', key: 'thermal', icon: Droplets },
  { value: 'cuisine', key: 'cuisine', icon: Coffee },
  { value: 'bazaar', key: 'bazaar', icon: ShoppingBag },
  { value: 'hiking', key: 'hiking', icon: Mountain },
];

export const INTENSITY_OPTIONS = [
  { value: 'relaxed', icon: Battery },
  { value: 'normal', icon: Compass },
  { value: 'intensive', icon: Zap },
];

export const TRANSPORT_OPTIONS = [
  { value: 'walking', icon: Footprints },
  { value: 'transit', icon: Bus },
  { value: 'car', icon: Car },
  { value: 'mixed', icon: Shuffle },
];
