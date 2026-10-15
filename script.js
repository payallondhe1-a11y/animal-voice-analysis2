/* =========================================================
   ANIMAL SOUND RECOGNITION
   SIGNALS & SYSTEMS PROJECT
   JavaScript + Web Audio API FFT
   ========================================================= */


/* =========================================================
   1. GET HTML ELEMENTS
   ========================================================= */

const audioUpload = document.getElementById("audioUpload");

const fileName = document.getElementById("fileName");

const audioSection = document.getElementById("audioSection");

const audioPlayer = document.getElementById("audioPlayer");

const resultsSection = document.getElementById("resultsSection");

const waveformCanvas =
    document.getElementById("waveformCanvas");

const fftCanvas =
    document.getElementById("fftCanvas");

const animalResult =
    document.getElementById("animalResult");

const frequencyResult =
    document.getElementById("frequencyResult");

const confidenceResult =
    document.getElementById("confidenceResult");

const probabilityBars =
    document.getElementById("probabilityBars");


/* =========================================================
   2. AUDIO CONTEXT
   ========================================================= */

let audioContext = null;

let audioBuffer = null;


/* =========================================================
   3. FILE UPLOAD
   ========================================================= */

audioUpload.addEventListener("change", async function () {

    const file = this.files[0];

    if (!file) {
        return;
    }

    /* Display file name */

    fileName.textContent =
        "Selected: " + file.name;


    /* Show audio player */

    audioSection.classList.remove("hidden");

    resultsSection.classList.remove("hidden");


    /* Create audio URL */

    const audioURL =
        URL.createObjectURL(file);

    audioPlayer.src = audioURL;


    try {

        /*
         * Create AudioContext
         */

        if (!audioContext) {

            audioContext =
                new (window.AudioContext ||
                    window.webkitAudioContext)();

        }


        /*
         * Read uploaded file
         */

        const arrayBuffer =
            await file.arrayBuffer();


        /*
         * Decode audio
         */

        audioBuffer =
            await audioContext.decodeAudioData(
                arrayBuffer
            );


        /*
         * Analyze audio
         */

        analyzeAudio(audioBuffer);


    } catch (error) {

        console.error(error);

        alert(
            "Unable to analyze this audio file. " +
            "Please try a WAV, MP3, OGG or FLAC file."
        );

    }

});


/* =========================================================
   4. MAIN AUDIO ANALYSIS
   ========================================================= */

function analyzeAudio(buffer) {

    /*
     * Get first audio channel
     */

    const channelData =
        buffer.getChannelData(0);

    const sampleRate =
        buffer.sampleRate;


    /*
     * Draw waveform
     */

    drawWaveform(
        channelData,
        sampleRate
    );


    /*
     * Perform FFT
     */

    const fftResult =
        performFFT(
            channelData,
            sampleRate
        );


    /*
     * Draw frequency spectrum
     */

    drawFrequencySpectrum(
        fftResult.frequencies,
        fftResult.magnitudes
    );


    /*
     * Find dominant frequency
     */

    const dominantFrequency =
        findDominantFrequency(
            fftResult.frequencies,
            fftResult.magnitudes
        );


    /*
     * Display dominant frequency
     */

    frequencyResult.textContent =
        dominantFrequency.toFixed(2);


    /*
     * Classify animal
     */

    const prediction =
        predictAnimal(
            dominantFrequency,
            channelData,
            sampleRate
        );


    /*
     * Display prediction
     */

    animalResult.textContent =
        prediction.animal;


    confidenceResult.textContent =
        prediction.confidence.toFixed(1) + "%";


    /*
     * Display probabilities
     */

    displayProbabilities(
        prediction.probabilities
    );

}


/* =========================================================
   5. DRAW TIME-DOMAIN WAVEFORM
   ========================================================= */

function drawWaveform(
    data,
    sampleRate
) {

    const canvas =
        waveformCanvas;

    const ctx =
        canvas.getContext("2d");


    /*
     * Set canvas resolution
     */

    const width =
        canvas.clientWidth || 800;

    const height = 300;

    canvas.width = width;
    canvas.height = height;


    /*
     * Clear canvas
     */

    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    /*
     * Background
     */

    ctx.fillStyle = "#fafbfe";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /*
     * Draw center line
     */

    ctx.strokeStyle = "#d9dbe5";

    ctx.lineWidth = 1;

    ctx.beginPath();

    ctx.moveTo(
        0,
        height / 2
    );

    ctx.lineTo(
        width,
        height / 2
    );

    ctx.stroke();


    /*
     * Number of samples to display
     *
     * Too many samples make the graph slow,
     * so we reduce them visually.
     */

    const step =
        Math.max(
            1,
            Math.floor(data.length / width)
        );


    /*
     * Draw waveform
     */

    ctx.beginPath();

    ctx.strokeStyle = "#6c63ff";

    ctx.lineWidth = 1.5;


    for (
        let x = 0;
        x < width;
        x++
    ) {

        const index =
            x * step;


        if (index >= data.length) {
            break;
        }


        const amplitude =
            data[index];


        const y =
            (1 - amplitude) *
            height / 2;


        if (x === 0) {

            ctx.moveTo(x, y);

        } else {

            ctx.lineTo(x, y);

        }

    }


    ctx.stroke();


    /*
     * Add axis labels
     */

    ctx.fillStyle = "#667085";

    ctx.font = "12px Arial";

    ctx.fillText(
        "Amplitude",
        10,
        20
    );

    ctx.fillText(
        "Time →",
        width - 55,
        height - 10
    );

}


/* =========================================================
   6. FFT FUNCTION
   ========================================================= */

function performFFT(
    signal,
    sampleRate
) {

    /*
     * FFT works most efficiently
     * with a power-of-two size.
     */

    let fftSize = 2048;


    /*
     * If signal is smaller than FFT size,
     * use the largest available power of 2.
     */

    if (signal.length < fftSize) {

        fftSize =
            Math.pow(
                2,
                Math.floor(
                    Math.log2(signal.length)
                )
            );

    }


    /*
     * Take a section from the audio.
     */

    const data =
        signal.slice(
            0,
            fftSize
        );


    /*
     * Apply Hann window
     *
     * This reduces spectral leakage.
     */

    const windowed =
        new Float64Array(
            fftSize
        );


    for (
        let i = 0;
        i < fftSize;
        i++
    ) {

        const hann =
            0.5 *
            (
                1 -
                Math.cos(
                    (2 * Math.PI * i) /
                    (fftSize - 1)
                )
            );

        windowed[i] =
            data[i] * hann;

    }


    /*
     * Separate real and imaginary parts
     */

    const real =
        new Float64Array(
            fftSize
        );

    const imag =
        new Float64Array(
            fftSize
        );


    for (
        let i = 0;
        i < fftSize;
        i++
    ) {

        real[i] =
            windowed[i];

        imag[i] = 0;

    }


    /*
     * Perform FFT
     */

    fft(real, imag);


    /*
     * Only positive frequencies
     */

    const half =
        fftSize / 2;


    const frequencies =
        new Float64Array(
            half
        );


    const magnitudes =
        new Float64Array(
            half
        );


    for (
        let i = 0;
        i < half;
        i++
    ) {

        frequencies[i] =
            (i * sampleRate) /
            fftSize;


        magnitudes[i] =
            Math.sqrt(
                real[i] * real[i] +
                imag[i] * imag[i]
            );

    }


    return {
        frequencies,
        magnitudes
    };

}


/* =========================================================
   7. FAST FOURIER TRANSFORM
   ========================================================= */

function fft(real, imag) {

    const n =
        real.length;


    /*
     * Bit reversal
     */

    let j = 0;


    for (
        let i = 1;
        i < n;
        i++
    ) {

        let bit =
            n >> 1;


        while (j & bit) {

            j ^= bit;

            bit >>= 1;

        }


        j ^= bit;


        if (i < j) {

            [
                real[i],
                real[j]
            ] =
            [
                real[j],
                real[i]
            ];


            [
                imag[i],
                imag[j]
            ] =
            [
                imag[j],
                imag[i]
            ];

        }

    }


    /*
     * FFT butterfly calculation
     */

    for (
        let length = 2;
        length <= n;
        length <<= 1
    ) {

        const angle =
            -2 *
            Math.PI /
            length;


        const wReal =
            Math.cos(angle);

        const wImag =
            Math.sin(angle);


        for (
            let i = 0;
            i < n;
            i += length
        ) {

            let currentReal = 1;

            let currentImag = 0;


            for (
                let k = 0;
                k < length / 2;
                k++
            ) {

                const evenIndex =
                    i + k;

                const oddIndex =
                    i +
                    k +
                    length / 2;


                const oddReal =
                    real[oddIndex];

                const oddImag =
                    imag[oddIndex];


                const tempReal =
                    currentReal *
                    oddReal -
                    currentImag *
                    oddImag;


                const tempImag =
                    currentReal *
                    oddImag +
                    currentImag *
                    oddReal;


                real[oddIndex] =
                    real[evenIndex] -
                    tempReal;


                imag[oddIndex] =
                    imag[evenIndex] -
                    tempImag;


                real[evenIndex] +=
                    tempReal;


                imag[evenIndex] +=
                    tempImag;


                /*
                 * Update twiddle factor
                 */

                const nextReal =
                    currentReal *
                    wReal -
                    currentImag *
                    wImag;


                const nextImag =
                    currentReal *
                    wImag +
                    currentImag *
                    wReal;


                currentReal =
                    nextReal;

                currentImag =
                    nextImag;

            }

        }

    }

}


/* =========================================================
   8. DRAW FREQUENCY SPECTRUM
   ========================================================= */

function drawFrequencySpectrum(
    frequencies,
    magnitudes
) {

    const canvas =
        fftCanvas;

    const ctx =
        canvas.getContext("2d");


    const width =
        canvas.clientWidth || 800;

    const height = 300;


    canvas.width = width;

    canvas.height = height;


    /*
     * Clear canvas
     */

    ctx.clearRect(
        0,
        0,
        width,
        height
    );


    /*
     * Background
     */

    ctx.fillStyle = "#fafbfe";

    ctx.fillRect(
        0,
        0,
        width,
        height
    );


    /*
     * Display frequencies up to 10 kHz
     */

    const maxFrequency =
        Math.min(
            10000,
            frequencies[
                frequencies.length - 1
            ]
        );


    /*
     * Find maximum magnitude
     */

    let maxMagnitude = 0;

    for (
        let i = 0;
        i < frequencies.length;
        i++
    ) {

        if (
            frequencies[i] <=
            maxFrequency
        ) {

            if (
                magnitudes[i] >
                maxMagnitude
            ) {

                maxMagnitude =
                    magnitudes[i];

            }

        }

    }


    /*
     * Draw spectrum
     */

    ctx.beginPath();

    ctx.strokeStyle = "#00a8cc";

    ctx.lineWidth = 1.5;


    for (
        let i = 0;
        i < frequencies.length;
        i++
    ) {

        const frequency =
            frequencies[i];


        if (
            frequency >
            maxFrequency
        ) {

            break;

        }


        const x =
            (frequency /
            maxFrequency) *
            width;


        const normalized =
            magnitudes[i] /
            maxMagnitude;


        const y =
            height -
            normalized *
            (height - 30);


        if (i === 0) {

            ctx.moveTo(x, y);

        } else {

            ctx.lineTo(x, y);

        }

    }


    ctx.stroke();


    /*
     * Axis labels
     */

    ctx.fillStyle = "#667085";

    ctx.font = "12px Arial";


    ctx.fillText(
        "Magnitude",
        10,
        20
    );


    ctx.fillText(
        "Frequency (Hz) →",
        width - 110,
        height - 10
    );


    /*
     * Frequency markers
     */

    const markers =
        [
            0,
            2000,
            4000,
            6000,
            8000,
            10000
        ];


    markers.forEach(
        function (frequency) {

            if (
                frequency >
                maxFrequency
            ) {
                return;
            }


            const x =
                (frequency /
                maxFrequency) *
                width;


            ctx.fillText(
                frequency,
                x,
                height - 25
            );

        }
    );

}


/* =========================================================
   9. FIND DOMINANT FREQUENCY
   ========================================================= */

function findDominantFrequency(
    frequencies,
    magnitudes
) {

    let maxMagnitude = 0;

    let dominantFrequency = 0;


    /*
     * Ignore frequencies above 10 kHz
     */

    for (
        let i = 1;
        i < frequencies.length;
        i++
    ) {

        if (
            frequencies[i] >
            10000
        ) {

            break;

        }


        if (
            magnitudes[i] >
            maxMagnitude
        ) {

            maxMagnitude =
                magnitudes[i];

            dominantFrequency =
                frequencies[i];

        }

    }


    return dominantFrequency;

}


/* =========================================================
   10. BASIC ANIMAL SOUND CLASSIFICATION
   ========================================================= */

function predictAnimal(
    dominantFrequency,
    signal,
    sampleRate
) {

    /*
     * IMPORTANT:
     *
     * This is NOT a machine-learning model.
     *
     * It is a simple frequency-based demonstration
     * so the GitHub Pages version can work without
     * a Python backend.
     *
     * The actual animal classification model should
     * use trained audio features such as MFCC + SVM.
     */


    const animals = {

        "Cat": 0,

        "Dog": 0,

        "Cow": 0,

        "Frog": 0,

        "Crow": 0,

        "Chirping Birds": 0

    };


    /*
     * Frequency-based heuristic
     *
     * These ranges are approximate and are NOT
     * scientifically reliable identification rules.
     */


    if (
        dominantFrequency >= 700 &&
        dominantFrequency < 1500
    ) {

        animals["Cat"] += 35;
        animals["Dog"] += 20;
        animals["Frog"] += 10;

    }


    if (
        dominantFrequency >= 1500 &&
        dominantFrequency < 3000
    ) {

        animals["Dog"] += 30;
        animals["Cat"] += 25;
        animals["Crow"] += 15;

    }


    if (
        dominantFrequency >= 3000 &&
        dominantFrequency < 5000
    ) {

        animals["Chirping Birds"] += 35;
        animals["Crow"] += 25;
        animals["Frog"] += 10;

    }


    if (
        dominantFrequency >= 5000
    ) {

        animals["Chirping Birds"] += 45;
        animals["Crow"] += 25;

    }


    if (
        dominantFrequency < 700
    ) {

        animals["Cow"] += 35;
        animals["Frog"] += 25;
        animals["Dog"] += 10;

    }


    /*
     * Add a small random-free signal characteristic
     * based on zero-crossing rate.
     */

    const zcr =
        calculateZeroCrossingRate(
            signal
        );


    if (zcr > 0.15) {

        animals["Chirping Birds"] += 10;

    }


    if (zcr < 0.05) {

        animals["Cow"] += 10;

    }


    /*
     * Calculate total score
     */

    let total = 0;

    Object.values(
        animals
    ).forEach(
        value => {
            total += value;
        }
    );


    /*
     * If no useful frequency rule matched,
     * give a neutral distribution.
     */

    if (total === 0) {

        Object.keys(
            animals
        ).forEach(
            animal => {
                animals[animal] = 1;
            }
        );

        total =
            Object.keys(
                animals
            ).length;

    }


    /*
     * Convert scores to percentages
     */

    const probabilities = {};

    Object.keys(
        animals
    ).forEach(
        animal => {

            probabilities[animal] =
                (
                    animals[animal] /
                    total
                ) * 100;

        }
    );


    /*
     * Find highest probability
     */

    let predictedAnimal =
        "Unknown";

    let highestProbability =
        0;


    Object.keys(
        probabilities
    ).forEach(
        animal => {

            if (
                probabilities[animal] >
                highestProbability
            ) {

                highestProbability =
                    probabilities[animal];

                predictedAnimal =
                    animal;

            }

        }
    );


    /*
     * Limit confidence so that this simple
     * demonstration doesn't claim unrealistic
     * certainty.
     */

    const confidence =
        Math.min(
            highestProbability,
            95
        );


    return {

        animal: predictedAnimal,

        confidence: confidence,

        probabilities: probabilities

    };

}


/* =========================================================
   11. ZERO CROSSING RATE
   ========================================================= */

function calculateZeroCrossingRate(
    signal
) {

    let crossings = 0;


    /*
     * Limit calculation for performance
     */

    const maxSamples =
        Math.min(
            signal.length,
            50000
        );


    for (
        let i = 1;
        i < maxSamples;
        i++
    ) {

        if (
            (
                signal[i] >= 0 &&
                signal[i - 1] < 0
            )
            ||
            (
                signal[i] < 0 &&
                signal[i - 1] >= 0
            )
        ) {

            crossings++;

        }

    }


    return crossings /
        maxSamples;

}


/* =========================================================
   12. DISPLAY PROBABILITY BARS
   ========================================================= */

function displayProbabilities(
    probabilities
) {

    /*
     * Clear previous results
     */

    probabilityBars.innerHTML = "";


    /*
     * Sort animals from highest to lowest
     */

    const sortedAnimals =
        Object.entries(
            probabilities
        ).sort(
            (a, b) =>
                b[1] - a[1]
        );


    /*
     * Create bars
     */

    sortedAnimals.forEach(
        function ([animal, probability]) {

            const item =
                document.createElement(
                    "div"
                );

            item.className =
                "probability-item";


            /*
             * Label
             */

            const info =
                document.createElement(
                    "div"
                );

            info.className =
                "probability-info";


            const name =
                document.createElement(
                    "span"
                );

            name.textContent =
                animal;


            const value =
                document.createElement(
                    "span"
                );

            value.textContent =
                probability.toFixed(1) +
                "%";


            info.appendChild(name);

            info.appendChild(value);


            /*
             * Background
             */

            const background =
                document.createElement(
                    "div"
                );

            background.className =
                "probability-background";


            /*
             * Fill
             */

            const fill =
                document.createElement(
                    "div"
                );

            fill.className =
                "probability-fill";


            fill.style.width =
                probability + "%";


            background.appendChild(
                fill
            );


            item.appendChild(
                info
            );

            item.appendChild(
                background
            );


            probabilityBars.appendChild(
                item
            );

        }
    );

}


/* =========================================================
   13. RESPONSIVE CANVAS
   ========================================================= */

window.addEventListener(
    "resize",
    function () {

        if (!audioBuffer) {
            return;
        }


        const channelData =
            audioBuffer.getChannelData(0);

        const sampleRate =
            audioBuffer.sampleRate;


        /*
         * Redraw waveform
         */

        drawWaveform(
            channelData,
            sampleRate
        );


        /*
         * Recalculate FFT
         */

        const fftResult =
            performFFT(
                channelData,
                sampleRate
            );


        /*
         * Redraw FFT
         */

        drawFrequencySpectrum(
            fftResult.frequencies,
            fftResult.magnitudes
        );

    }
);


/* =========================================================
   14. PAGE LOAD MESSAGE
   ========================================================= */

console.log(
    "🐾 Animal Sound Recognition System Loaded"
);

console.log(
    "Signals & Systems: Time Domain → FFT → Frequency Domain"
);
