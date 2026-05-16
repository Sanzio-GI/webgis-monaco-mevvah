export interface PlaceDesc {
  emoji: string;
  cat: string;
  desc: string;
}

export const PLACE_DESCRIPTIONS: Record<string, PlaceDesc> = {
  'Casino de Monte-Carlo': { emoji: '🎰', cat: 'Kasino & Hiburan', desc: 'Kasino paling legendaris di dunia, dibuka 1863. Bangunan bergaya Belle Époque ini menjadi simbol kemewahan Monaco dan telah muncul dalam berbagai film James Bond.' },
  'Palais Princier de Monaco': { emoji: '👑', cat: 'Istana Kerajaan', desc: 'Kediaman resmi Keluarga Grimaldi sejak abad ke-13. Pengunjung dapat menyaksikan upacara pergantian penjaga setiap hari pukul 11:55.' },
  'Musée Océanographique': { emoji: '🐠', cat: 'Museum Sains', desc: 'Museum oseanografi tertua di dunia, didirikan Pangeran Albert I tahun 1910. Terletak di tebing setinggi 85m, menampilkan koleksi laut dan akuarium tropis.' },
  'Cathédrale Notre-Dame': { emoji: '⛪', cat: 'Tempat Ibadah', desc: 'Katedral utama Monaco bergaya Neo-Romanesque, dibangun 1875. Tempat pernikahan Pangeran Rainier III dan Grace Kelly (1956). Keduanya dimakamkan di sini.' },
  'Jardin Exotique': { emoji: '🌵', cat: 'Taman & Alam', desc: 'Taman kaktus dan sukulen terlengkap di Eropa, terletak di tebing curam dengan panorama Monaco yang spektakuler. Dibuka sejak 1933.' },
  'Stade Louis II': { emoji: '⚽', cat: 'Olahraga', desc: 'Stadion kebanggaan Monaco berkapasitas 18.500 penonton, markas AS Monaco FC. Pernah menjadi tuan rumah Piala Super UEFA.' },
  'Circuit de Monaco': { emoji: '🏎️', cat: 'Formula 1', desc: 'Sirkuit balap jalanan paling ikonik di dunia F1. Dijuluki "The Jewel in the Crown of Formula 1".' },
  'Opéra de Monte-Carlo': { emoji: '🎭', cat: 'Seni & Budaya', desc: 'Gedung opera megah bergaya Belle Époque dirancang arsitek Charles Garnier, dibuka 1879. Salah satu panggung opera paling bergengsi di Eropa.' },
  'Port Hercule': { emoji: '⛵', cat: 'Pelabuhan', desc: 'Satu-satunya pelabuhan alam dalam Monaco, dermaga yacht dan kapal pesiar mewah dari seluruh dunia.' },
  'Grimaldi Forum': { emoji: '🎪', cat: 'Pusat Konvensi', desc: 'Pusat konvensi dan budaya Monaco yang terletak langsung di tepi pantai Mediterania.' },
  'Larvotto': { emoji: '🏖️', cat: 'Pantai', desc: 'Kawasan pantai satu-satunya Monaco dengan pantai publik berbatu dan air jernih Mediterania.' },
  'Rocher de Monaco': { emoji: '🏰', cat: 'Kawasan Bersejarah', desc: 'Bukit karang tempat berdirinya Monaco-Ville, istana, dan katedral. Inti Kerajaan Monaco sejak abad pertengahan.' },
  'Monte-Carlo': { emoji: '💎', cat: 'Kawasan', desc: 'Kawasan paling terkenal Monaco, identik dengan kemewahan, kasino, dan kehidupan glamor.' },
  'La Condamine': { emoji: '🏘️', cat: 'Kawasan', desc: 'Kawasan bersejarah Monaco di tepi Port Hercule. Dikenal dengan pasar tradisional dan restoran lokal.' },
  'Fontvieille': { emoji: '🏭', cat: 'Kawasan', desc: 'Kawasan industri dan komersial Monaco yang dibangun di atas lahan reklamasi laut.' },
  'Hôtel de Paris Monte-Carlo': { emoji: '🏨', cat: 'Hotel Mewah', desc: 'Hotel bintang lima paling legendaris Monaco sejak 1863. Wine cellar dengan 600.000+ botol anggur.' },
  'Le Louis XV': { emoji: '👨‍🍳', cat: 'Fine Dining', desc: 'Restoran bintang tiga Michelin karya Chef Alain Ducasse di dalam Hotel de Paris.' },
  'Place du Casino': { emoji: '🌹', cat: 'Kawasan Publik', desc: 'Alun-alun utama Monaco yang megah, dikelilingi Casino de Monte-Carlo, Hotel de Paris, dan Café de Paris.' },
  'Gare de Monaco-Monte-Carlo': { emoji: '🚉', cat: 'Stasiun Kereta', desc: 'Stasiun kereta bawah tanah Monaco yang unik, menghubungkan Monaco dengan jalur kereta pantai Nice-Ventimiglia.' },
  'Heliport de Monaco': { emoji: '🚁', cat: 'Transportasi', desc: 'Helipad komersial di Fontvieille yang menghubungkan Monaco dengan Bandara Nice dalam 7 menit.' },
  'Centre Hospitalier Princesse Grace': { emoji: '🏥', cat: 'Rumah Sakit', desc: 'Rumah sakit utama Monaco dengan fasilitas medis berteknologi tinggi berstandar Eropa.' },
  'Jardin Japonais': { emoji: '🌸', cat: 'Taman Jepang', desc: 'Taman Jepang seluas 7.000 m² bergaya Zen di tepi laut yang menawarkan ketenangan.' },
  'Musée Naval': { emoji: '⚓', cat: 'Museum Maritim', desc: 'Museum angkatan laut di Fontvieille menampilkan koleksi model kapal dan peralatan navigasi kuno.' },
  'Collection de Voitures Anciennes': { emoji: '🚗', cat: 'Museum Otomotif', desc: 'Koleksi 100+ mobil antik dan mewah milik Keluarga Grimaldi di Fontvieille.' },
  'Monte-Carlo Country Club': { emoji: '🎾', cat: 'Olahraga', desc: 'Klub tenis bergengsi tempat Monte-Carlo Masters diselenggarakan setiap April.' },
  'Yacht Club de Monaco': { emoji: '⛵', cat: 'Klub Yacht', desc: 'Klub olahraga layar elit Monaco, menyelenggarakan berbagai regatta bergengsi.' },
};

export function findDescription(name: string | null | undefined): PlaceDesc | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  const keys = Object.keys(PLACE_DESCRIPTIONS);
  const exact = keys.find(k => k.toLowerCase() === n);
  if (exact) return PLACE_DESCRIPTIONS[exact];
  const partial = keys.find(k => n.includes(k.toLowerCase()) || k.toLowerCase().includes(n));
  return partial ? PLACE_DESCRIPTIONS[partial] : null;
}
