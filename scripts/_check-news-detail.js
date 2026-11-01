// Check news detail API: contentHtml, images, cover
const BASE = 'http://127.0.0.1:4173';

// First get a list of news
fetch(`${BASE}/api/search?type=news&page_size=5`)
  .then(r => r.json())
  .then(async data => {
    for (const item of data.results) {
      console.log(`\n=== ${item.title.slice(0, 40)} ===`);
      console.log(`  list cover: ${item.cover || '(none)'}`);
      console.log(`  id: ${item.id}`);

      // Fetch detail
      const dr = await fetch(`${BASE}/api/detail/news/${item.id}`);
      if (!dr.ok) { console.log(`  detail API: ${dr.status}`); continue; }
      const dd = await dr.json();
      const article = dd.article || {};
      const record = dd.record || {};

      console.log(`  article.images: ${JSON.stringify(article.images || []).slice(0, 120)}`);
      console.log(`  article.contentHtml length: ${String(article.contentHtml || '').length}`);
      const html = String(article.contentHtml || '');
      const imgTags = html.match(/<img[^>]*>/gi) || [];
      console.log(`  contentHtml <img> count: ${imgTags.length}`);
      if (imgTags.length) console.log(`  first img tag: ${imgTags[0].slice(0, 150)}`);

      // Check if contentHtml has data-src images
      const dataSrc = html.match(/data-src=["'][^"']+["']/gi) || [];
      console.log(`  data-src count: ${dataSrc.length}`);

      // Check record.detail
      console.log(`  record.detail keys: ${Object.keys(record.detail || {}).join(', ')}`);
      console.log(`  record.detail.cover: ${record.detail && record.detail.cover || '(none)'}`);
    }
  })
  .catch(e => console.log('Error:', e.message));
