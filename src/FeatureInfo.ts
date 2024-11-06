import maplibregl from 'maplibre-gl';

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
      console.log('Feature info:', data);
      if (data.elements && data.elements.length > 0) {
        const feature = data.elements[0];
        const tags = feature.tags || {};
        // 表示名を取得
        const name = tags.name || tags['name:ja'] || tags['name:en'] || tags['name:zh'];
        // ポップアップを作成
        const popupContent = Object.entries(tags)
          .map(([key, value]) => `<div><strong>${key}:</strong> ${value}</div>`)
          .join('');
        new maplibregl.Popup()
          .setLngLat([lng, lat])
          .setHTML(`
            <div style="max-height: 300px; overflow-y: auto;">
              <h3 style="margin-bottom: 8px; font-weight: bold;">${name || ''}</h3>
              ${popupContent || 'この地点には情報がありません'}
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