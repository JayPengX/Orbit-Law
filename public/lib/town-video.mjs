// 鄉鎮市民代表會 on YouTube: the channel each one streams and posts its sittings on, found by YouTube's own channel
// search and checked by eye (scripts/find-town-youtube.mjs). The build reads each (scripts/build-council.mjs →
// council/town-video/<tc>.json, as a council's: lib/council-video.mjs ytLockups, ytItems); the town's sheet plays them.
// 內政部's town code → [the channel, the name its titles carry].
export const TOWN_YOUTUBE = {
  '09007020': ['UCp0xacdtGmMg4LCB4QpjoQw', '北竿鄉民代表會'], // 北竿鄉鄉民代表會
  '10002090': ['UCt7jTzqCTVSnzpwMupsXrDQ', '五結鄉民代表會'], // 五結鄉民代表會
  '10002100': ['UCzYSAHm9CSOwYsFAmJGuiyg', '三星鄉民代表會'], // 三星鄉民代表會
  '10004010': ['UCY6z9CJ6qw-i40R66B1T_Ng', '竹北市民代表會'], // 竹北市民代表會
  '10004090': ['UCcLl_1ymiHDjFAfW87OSiJw', '北埔鄉民代表會'], // 北埔鄉民代表會
  '10004120': ['UCgps4fN82hv_hhq1Xi7yrpw', '尖石鄉民代表會'], // 尖石鄉民代表會
  '10004130': ['UCpf6hqDCyoJJSAzNdwHQnLw', '五峰鄉民代表會'], // 五峰代表會
  '10005010': ['UC89zxkJjReUQO0HRGH5Lu2A', '苗栗市民代表會'], // 苗栗市民代表會
  '10005050': ['UCNWtY0kL4Hub1z4pNhCoqWg', '頭份市民代表會'], // 苗栗縣頭份市民代表會
  '10005100': ['UCk8cQ7DE1XoXaey-J1j88Rg', '銅鑼鄉民代表會'], // 苗栗縣銅鑼鄉民代表會
  '10005180': ['UCyMscmFKpwbkoniIJRoP0KA', '泰安鄉民代表會'], // 泰安鄉民代表會
  '10007020': ['UCmFv7MrTly0YRZbcXxBOZjg', '鹿港鎮民代表會'], // 彰化縣鹿港鎮民代表會
  '10007050': ['UC5GnBChRUDXx602tv12coJA', '伸港鄉民代表會'], // 伸港鄉民代表會
  '10007100': ['UCoY_iNg1iVayVFPMSRk3KPw', '員林市民代表會'], // 彰化縣員林市民代表會
  '10007120': ['UCwRYaLCIPv0mbxz8_W2nxww', '田中鎮民代表會'], // 彰化縣田中鎮民代表會
  '10007140': ['UCFlHWXtNW4S6kbmYclo4LGw', '埔鹽鄉民代表會'], // 彰化縣埔鹽鄉民代表會
  '10007260': ['UC9RMmEZHzG_f0hIP8ZUOz5Q', '溪州鄉民代表會'], // 彰化縣溪州鄉民代表會hsrc
  '10008040': ['UCtB_x9o6TXbzZSZFS50Yyug', '竹山鎮民代表會'], // 南投縣竹山鎮民代表會
  '10009020': ['UCqqUFWqOXEg9p6qj5w-aGbQ', '斗南鎮民代表會'], // 斗南鎮民代表會
  '10009040': ['UC79KDe2dwujPz_hapbzUvYw', '西螺鎮民代表會'], // 西螺鎮民代表會
  '10009160': ['UCXOpMpKom0f3ea3CF8sFmPA', '臺西鄉民代表會'], // 雲林縣臺西鄉民代表會
  '10010010': ['UCarhF-TWJARvgRtggjqJ1OA', '太保市民代表會'], // 太保市民代表會
  '10010040': ['UCG1QYCiIZNxVL2-Q-nt7Ilw', '大林鎮民代表會'], // 嘉義縣大林鎮民代表會
  '10013040': ['UCXmqpx1JW0rZC3JeWQiMYhw', '恆春鎮民代表會'], // 恆春鎮民代表會 屏東縣
  '10013110': ['UCzTi_WbC3me_4na3Pg98nxA', '高樹鄉民代表會'], // 高樹鄉代表會
  '10013200': ['UCa1sH6Bcl0J0qXn2mw_oRIw', '南州鄉民代表會'], // 南州鄉民代表會
  '10013260': ['UCCYrs89BSkvYyVEVAdJEVhw', '三地門鄉民代表會'], // 三地門鄉民代表會三地門鄉民代表會
  '10013270': ['UC9VlASdEB_y2q4IpYCj3Wxw', '霧臺鄉民代表會'], // 霧臺鄉民代表會
  '10013290': ['UCRq9H8hV2a7fpstc2tALRrw', '泰武鄉民代表會'], // 泰武鄉民代表會
  '10013300': ['UCPI2S3ZtgA7bSxTWgvkYuDA', '來義鄉民代表會'], // 來義鄉代表會
  '10014010': ['UCLhxSy8HTqUrQAVtbXD-WEA', '臺東市民代表會'], // 臺東臺東市民代表會
  '10014020': ['UCdfz64be_OIOKkQOAv9iJDw', '成功鎮民代表會'], // 成功鎮民代表會
  '10014030': ['UCUIhhNPJO4aNtZssvvO4R5g', '關山鎮民代表會'], // 關山鎮民代表會
  '10014090': ['UCeTtHHrHwK6hMDh02fkaM8A', '太麻里鄉民代表會'], // 臺東縣太麻里鄉民代表會
  '10014110': ['UC6gBU_yYc5ZakdmKlyp4-Lg', '綠島鄉民代表會'], // 綠島鄉鄉民代表會
  '10014140': ['UCW2RhfRIxOamoOUM-bjKhrA', '金峰鄉民代表會'], // 金峰鄉民代表會
  '10014150': ['UCL7hFhkMbYwa9dazlD7mFtA', '達仁鄉民代表會'], // 臺東縣達仁鄉民代表會
  '10015010': ['UCczsECHiJNT4SxxSsFVExuw', '花蓮市民代表會'], // 花蓮縣花蓮市民代表會
  '10015030': ['UCSVSCfjRxNTj-AjByLIANQQ', '玉里鎮民代表會'], // 玉里鎮民代表會
  '10015090': ['UC31LRdgHR0-2XpYh3D4cbDA', '瑞穗鄉民代表會'], // 花蓮縣瑞穗鄉民代表會官方頻道
  '10015100': ['UCpWnviCT2CAXoz3-pY64REA', '富里鄉民代表會'], // 花蓮縣富里鄉民代表會
  '10015110': ['UCn2KbRhY5VD7--6B2q9oaPg', '秀林鄉民代表會'], // 秀林鄉民代表會
  '10015130': ['UC5V5QRirc4wXSAhBONBZ4dg', '卓溪鄉民代表會'], // 花蓮縣卓溪鄉民代表會
  '10016010': ['UCpOSqni20v3eHDZ_11B2iYQ', '馬公市民代表會'], // 澎湖縣馬公市民代表會
  '64000370': ['UCutvNuHsV4sUnauC-M7l6Xg', '桃源區民代表會'], // 桃源區民代表會桃源區民代表會
  '64000380': ['UCHhvCJ2EHAEdJJiVOLlwomQ', '那瑪夏區民代表會'], // 高雄市那瑪夏區民代表會
  '66000290': ['UC-191AQpeTsZG7z6eq671oA', '和平區民代表會'], // 臺中市和平區民代表會
};

// A town's recording's title without its county (宜蘭縣第19次臨時會 → 第19次臨時會) or its own name as 台 writes it.
const COUNTY = /^[臺台]?(?:基隆市|北市|新北市|桃園市|新竹[縣市]|苗栗縣|中市|彰化縣|南投縣|雲林縣|嘉義[縣市]|南市|高雄市|屏東縣|宜蘭縣|花蓮縣|東縣|澎湖縣|金門縣|連江縣)\s*/;
export const townTitle = (n, name = '') => String(n || '').split(name.replace(/臺/g, '台')).join('').replace(COUNTY, '').replace(/^[\s·｜|\-–—]+/, '').trim() || n;
