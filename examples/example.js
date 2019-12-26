
const { extractSpectrum } = require("../spectral-extract.js");

const main = async () => {
    await extractSpectrum("example.wav", {
        mode: "multi",
        frequencyFilters: [[50, 200], [300, 500]],
        threshold: -70,
        outputDir: "out"
    });
};

main();