// Sohbet için basit, sabit, plana yönelik öneri chip'leri.
// Bilinçli karar: gün-bazlı "Gün N: daha çok müze/yemek" türü dinamik öneriler
// KULLANILMAZ — bunlar plana göre taşıyor ve gürültü yaratıyordu. Bunun yerine
// her plan için aynı, genel plan-iyileştirme önerileri gösterilir (sade tutuldu).
// label butonda görünür, message AI'a aynen gönderilir.

const CHIPS = {
  tr: [
    { id: 'improve', label: 'Bu planı nasıl geliştirebilirim?', message: 'Bu planı nasıl geliştirebilirim?' },
    { id: 'cheaper', label: 'Daha uygun bütçeli öneriler', message: 'Planı daha uygun bütçeli mekanlarla güncelle.' },
    { id: 'local', label: 'Yerel ve az bilinen yerler', message: 'Turistik olmayan, yerel ve az bilinen yerler öner.' },
    { id: 'relax', label: 'Planı biraz yavaşlat', message: 'Planı daha rahat bir tempoya çek, günleri seyrekleştir.' },
  ],
  en: [
    { id: 'improve', label: 'How can I improve this plan?', message: 'How can I improve this plan?' },
    { id: 'cheaper', label: 'More budget-friendly options', message: 'Update the plan with more budget-friendly places.' },
    { id: 'local', label: 'Local, lesser-known spots', message: 'Suggest non-touristy, local and lesser-known places.' },
    { id: 'relax', label: 'Make it more relaxed', message: 'Make the plan a more relaxed pace with fewer stops per day.' },
  ],
};

// Plan varsa sabit öneri setini döndür; plan yoksa boş (welcome ekranı kendi
// genel önerilerine düşer).
export function buildFollowupSuggestions(dailyPlan, language) {
  if (!dailyPlan?.days?.length) return [];
  return CHIPS[language === 'tr' ? 'tr' : 'en'];
}
