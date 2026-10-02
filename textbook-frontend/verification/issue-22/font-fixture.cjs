// Local test fixture for Next's supported font mock. Production fonts are unchanged.
module.exports = new Proxy({}, {
    get: (_target, url) => {
        const family = String(url).includes("Geist+Mono") ? "Geist Mono" : "Geist";
        return `/* latin */
@font-face {
    font-family: '${family}';
    font-style: normal;
    font-weight: 100 900;
    src: url(/usr/share/fonts/truetype/open-sans/OpenSans-Regular.ttf) format('truetype');
}`;
    },
});
