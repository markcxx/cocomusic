// NetEase profiles store region as GB/T 2260 administrative codes (e.g. 440000 / 440300).
// Province-level names cover the useful part; cities are only named for municipalities
// and a few major cities, otherwise the province alone is shown.

const PROVINCES: Record<number, string> = {
  11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古', 21: '辽宁', 22: '吉林', 23: '黑龙江',
  31: '上海', 32: '江苏', 33: '浙江', 34: '安徽', 35: '福建', 36: '江西', 37: '山东', 41: '河南',
  42: '湖北', 43: '湖南', 44: '广东', 45: '广西', 46: '海南', 50: '重庆', 51: '四川', 52: '贵州',
  53: '云南', 54: '西藏', 61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏', 65: '新疆', 71: '台湾',
  81: '香港', 82: '澳门',
};

const CITIES: Record<number, string> = {
  1301: '石家庄', 1401: '太原', 2101: '沈阳', 2102: '大连', 2201: '长春', 2301: '哈尔滨',
  3201: '南京', 3202: '无锡', 3205: '苏州', 3301: '杭州', 3302: '宁波', 3401: '合肥', 3501: '福州', 3502: '厦门',
  3601: '南昌', 3607: '赣州', 3701: '济南', 3702: '青岛', 4101: '郑州', 4201: '武汉', 4301: '长沙',
  4401: '广州', 4403: '深圳', 4404: '珠海', 4406: '佛山', 4419: '东莞', 4501: '南宁', 4601: '海口',
  5101: '成都', 5201: '贵阳', 5301: '昆明', 6101: '西安', 6201: '兰州',
};

/** 1 municipality/SAR: the province name is the city. */
const SINGLE = new Set([11, 12, 31, 50, 81, 82]);

export function regionName(province?: number, city?: number) {
  if (!province || province <= 0) return undefined;
  const provinceKey = Math.floor(province / 10000);
  const name = PROVINCES[provinceKey];
  if (!name) return undefined;
  if (SINGLE.has(provinceKey) || !city) return name;
  const cityName = CITIES[Math.floor(city / 100)];
  return cityName ? `${name} ${cityName}` : name;
}
