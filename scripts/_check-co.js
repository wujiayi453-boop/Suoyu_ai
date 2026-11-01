// Check company API results detail field
const BASE = 'http://127.0.0.1:4173';
fetch(`${BASE}/api/search?type=company&page_size=5`)
  .then(r => r.json())
  .then(data => {
    console.log('API company results:');
    data.results.forEach(c => {
      const logo = c.detail && c.detail.logo;
      console.log(`  ${c.title}: hasDetail=${!!c.detail}, hasLogo=${!!logo}, logo=${logo ? logo.slice(0, 60) : '(none)'}`);
    });
  })
  .catch(e => console.log('Error:', e.message));
