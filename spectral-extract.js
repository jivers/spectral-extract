const fs = require("fs");
const path = require("path");

const { fft, ifft } = require('fft-js');

const { encode } = require("wav-encoder");
const { decode } = require("wav-decoder");

const writeWaveFile = async (arr, baseName, options={}) => {
    const appendValue = (options.append) ? options.append : 'extract';
    const sampleRate = (options.sampleRate) ? options.sampleRate : 44100;

    const sampleOut = {
        sampleRate: sampleRate,
        channelData: [new Float32Array(arr)]
    };

    const buf = await encode(sampleOut);
    
    const outputFilePath = ((outputDir = options.outputDir ? options.outputDir : 'out') => { //Force default to out
        try {
            fs.mkdirSync(`${outputDir}`);
        } catch(err) {} // folder exists
        return `${outputDir}/${baseName}_${appendValue}.wav`
    })();

    fs.writeFileSync(`${outputFilePath}`, Buffer.from(buf));
};

// ~*~*~*~*~*~ Complex helpers ~*~*~*~*~*~
const complex = (r, i) => [r, i];

const complexSubtract = (c1, c2) => complex(c1[0] - c2[0], c1[1] - c2[1]);
const complexMultiply = (c1, c2) => complex(
    (c1[0] * c2[0] - c1[1] * c2[1]),
    (c1[0] * c2[1] + c1[1] * c2[0])
);


// ~*~*~*~*~*~ Helper functions for frequency domain processing ~*~*~*~*~*~
const dynamicFilter = (bin, windowLength, thresDB) => {
    let re = bin[0];
    let im = bin[1];

    const magnitude = 2 * Math.sqrt(re * re + im * im) / (windowLength / 2);
    const decibels = 20. * Math.log10(magnitude);

    // If bin dB level is less than threshold dB level, attenuate to 0
    return (decibels < thresDB) ? complexMultiply(bin, complex(0, 0))
        : bin;
}

const binFrequency = (binPosition, windowLength, sampleRate) => {
    const binFreqRange = sampleRate / (windowLength);
    return binPosition * binFreqRange;
}

const freqFilter = (bin, binFrequecy, frequencyRanges) => {
    // Is the current bin frequency currently within one of the frequencyRanges boundaries? 
    const isInFilterRanges = frequencyRanges.reduce((acc, freqRange) => {
        const inRange = ((binFrequecy > freqRange[0]) && (binFrequecy < freqRange[1]));

        if (inRange) acc = true;
        return acc;

    }, false);

    return (isInFilterRanges) ? bin : complexSubtract(bin, bin);
}

const extractSpectrum = async (inputFilePath, options = {}) => {
    
    // ~*~*~*~*~*~ Prepare audio file for fft analysis ~*~*~*~*~*~
    const fileBuffer = fs.readFileSync(inputFilePath);

    const audioData = await decode(fileBuffer).then(data => {
        const { sampleRate, numberOfChannels, length } = data;

        // FFT implementation needs 2^x length sample
        // @NB:: Sample length is quantized to nearest 2^x below
        // In almost all cases this will trim a section of the track
        // @TODO:: Use different fft algorithm
        const quantizedLength = Math.pow(2, Math.floor(Math.log2(length)));
        // Traditional loops are see minor performance improvements
        // Currently, conerting to complex values takes 75% if the time (float -> array)
        const complexValues = [...Array(quantizedLength)].map((nV, i) => {
            // Mono sum channel data
            const sumVal = (() => {
                let val = 0;
                for(let j = 0; j < numberOfChannels; j++) {
                    val += data.channelData[j][i];
                };

                return val / numberOfChannels; // attenuate based on numChannels
            })();

            return nV = complex(sumVal, 0);
        });

        return {
            sampleRate,
            numberOfChannels,
            length: quantizedLength,
            complexValues
        }
    });

    // ~*~*~*~*~*~ Perform fft and calculate frequency and magnitude values ~*~*~*~*~*~
    const { sampleRate, length } = audioData;

    const phasors = fft(audioData.complexValues);

    // ~*~*~*~*~*~ Parse options and assign defaults based on frequency data ~*~*~*~*~*~
    // If no frequency options, assign single frequency filter of the range of available frequences
    const frequencyRangeFilters = (options.frequencyFilters) ? options.frequencyFilters : [[binFrequency(0, length, sampleRate), binFrequency(length / 2, length, sampleRate)]];
    const processMode = (options.mode) ? options.mode : 'single';

    // Support two processing modes:
    // single - All filtering rendered into single file
    // multi - Each frequency filter rendered to new sample 
    // NOTE: dynamic filtering will be appled is threshold is present to the full spectrum frequency filters are rendered
    if (processMode === 'single') {
        let channelData = Array(length);

        for (let i = 0; i < channelData.length; i++) {
            channelData[i] = phasors[i];

            if (options.threshold) { // If a threshold is set, silence bins based on dB value 
                channelData[i] = dynamicFilter(channelData[i], length, options.threshold);
            }

            const currentFrequency = binFrequency(i, length, sampleRate);
            channelData[i] = freqFilter(channelData[i], currentFrequency, frequencyRangeFilters);
        };

        channelData = ifft(channelData).map(c => c[0] * 2.0); // Scale amplitude

        await writeWaveFile(channelData, path.basename(inputFilePath, '.wav'), {...options, sampleRate });
    } 
    else if (processMode === 'multi') {
        const writeFiles = frequencyRangeFilters.map(filter => {
            return new Promise(async (resolve, reject) => {
                let channelData = Array(length);
                for (let i = 0; i < channelData.length; i++) {
                    channelData[i] = phasors[i];
        
                    if (options.threshold) { // If a threshold is set, silence bins based on dB value 
                        channelData[i] = dynamicFilter(channelData[i], length, options.threshold);
                    }
        
                    const currentFrequency = binFrequency(i, length, sampleRate);
                    channelData[i] = freqFilter(channelData[i], currentFrequency, [filter]);
                }

                channelData = ifft(channelData).map(c => c[0] * 2.0); // Scale amplitude
                await writeWaveFile(channelData, path.basename(inputFilePath, '.wav'), {...options, sampleRate, append: `${filter[0]}-${filter[1]}` });

                resolve(true);
            })
        });

        await Promise.all(writeFiles);
    }
};

module.exports = {
    extractSpectrum
}