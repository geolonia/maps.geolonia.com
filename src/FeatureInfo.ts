import maplibregl from 'maplibre-gl';
// タグの日本語変換マッピング
const tagTranslations: { [key: string]: string } = {
  'addr:block_number': '街区番号',
  'addr:city': '市区町村',
  'addr:housenumber': '番地',
  'addr:neighbourhood': '丁目',
  'addr:postcode': '郵便番号',
  'addr:province': '都道府県',
  'addr:quarter': '地区',
  'brand': 'ブランド',
  'brand:en': 'ブランド(英語)',
  'brand:ja': 'ブランド(日本語)',
  'brand:wikidata': 'Wikidata ID',
  'brand:wikipedia': 'Wikipedia',
  'name': '名称',
  'name:en': '名称(英語)',
  'name:ja': '名称(日本語)',
  'opening_hours': '営業時間',
  'shop': '店舗種別'
};

const addFeatureInfoHandler = (map: maplibregl.Map) => {
  map.on('click', async (e) => {
    const { lat, lng } = e.lngLat;
    
    try {
      const query = `
        [out:json];
        (
          node(around:10,${lat},${lng});
          way(around:10,${lat},${lng});
          relation(around:10,${lat},${lng});
        )->.all;
        .all out body 1;
      `;
      
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query,
      });
      
      const data = await response.json();
      if (data.elements && data.elements.length > 0) {
        const feature = data.elements[0];
        const tags = feature.tags || {};
        //各要素を取得
        // 表示名を取得
        const name = tags.name || tags['name:ja'] || tags['name:en'] || tags['name:zh'];
        const wikidata = tags['brand:wikidata'];
        const source_ref = tags['source_ref'];
        const website = tags['website'];
        // ポップアップを作成
        const popupContent = Object.entries(tags)
        .map(([key, value]) => {
          const translatedKey = tagTranslations[key] || key;
          return `<div><strong>${translatedKey}:</strong> ${value}</div>`;
        })
        .join('');
        
        new maplibregl.Popup()
          .setLngLat([lng, lat])
          .setHTML(`
            <div>
              <h3>
                ${name || 'No Title'}
              </h3>
              <div>
                ${popupContent || 'この地点には情報がありません'}
              </div>
              ${wikidata ? `
                <div>
                  <a href="https://www.wikidata.org/wiki/${wikidata}" target="_blank" style="
                    color: #1a73e8; 
                    text-decoration: none;
                  ">
                    Wikidataを見に行く
                  </a>
                </div>
              ` : ''}
              ${name ? `
                <div>
                  <a href="https://ja.wikipedia.org/wiki/${name}" target="_blank" style="
                    color: #1a73e8; 
                    text-decoration: none;
                  ">
                    Wikipediaを見に行く
                  </a>
                </div>
              ` : ''}
              ${source_ref ? `
                <div>
                  <a href="${source_ref}" target="_blank">
                    参照先を見に行く
                  </a>
                </div>
              ` : ''}
              ${website ? `
                <div>
                  <a href="${website}" target="_blank">
                    ウェブサイトを見に行く
                  </a>
                </div>
              ` : ''}
            </div>
          `)
          .addTo(map);
      }
    } catch (error) {
      console.error('Error fetching feature info:', error);
    }
  });
};

export default addFeatureInfoHandler;