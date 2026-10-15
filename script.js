// ===== AI ANIMAL SOUND CLASSIFICATION =====

let audioClassifier = null;
let modelLoading = false;

async function loadAnimalModel() {
    if (audioClassifier) return true;
    if (modelLoading) return false;

    modelLoading = true;

    try {
        $("animalName").textContent = "Loading AI Model...";
        $("predictionNote").textContent =
            "Downloading the sound classification model.";

        const audioFiles = await FilesetResolver.forAudioTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio/wasm"
        );

        audioClassifier = await AudioClassifier.createFromOptions(
            audioFiles,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite"
                },
                maxResults: 10
            }
        );

        $("animalName").textContent = "AI Model Connected";
        $("predictionNote").textContent =
            "YAMNet sound classification model is ready.";

        return true;

    } catch (error) {
        console.error("Model loading error:", error);

        $("animalName").textContent = "Model Loading Failed";
        $("predictionNote").textContent =
            "Check your internet connection and browser console.";

        return false;

    } finally {
        modelLoading = false;
    }
}


// Classify the uploaded or recorded sound
async function predictAnimal(buffer) {
    const loaded = await loadAnimalModel();

    if (!loaded) {
        $("confidence").textContent =
            "Prediction unavailable. Model could not load.";
        return;
    }

    try {
        $("animalName").textContent = "Predicting...";
        $("predictionNote").textContent =
            "AI is analyzing the audio sound.";

        // Get audio samples from the existing audio buffer
        const samples = buffer.getChannelData(0);

        // Run YAMNet classification
        const results = audioClassifier.classify(
            samples,
            buffer.sampleRate
        );

        if (!results || results.length === 0) {
            throw new Error("The model returned no results.");
        }

        const categories =
            results[0].classifications[0].categories;

        if (!categories || categories.length === 0) {
            $("animalName").textContent = "No Clear Prediction";
            $("predictionNote").textContent =
                "The model did not return a sound category.";
            $("confidence").textContent = "Confidence unavailable";
            return;
        }

        // Animal-related labels supported by YAMNet
        const animalLabels = [
            "cat",
            "dog",
            "bark",
            "meow",
            "bird",
            "bird vocalization",
            "chirp",
            "crow",
            "pigeon",
            "rooster",
            "chicken",
            "duck",
            "frog",
            "horse",
            "cow",
            "sheep",
            "goat",
            "pig",
            "wild animals",
            "animal"
        ];

        // Prefer a recognized animal-related sound category
        const animalResults = categories.filter(category =>
            animalLabels.some(label =>
                category.categoryName
                    .toLowerCase()
                    .includes(label)
            )
        );

        const best = animalResults[0];

        if (best) {
            $("animalName").textContent = best.categoryName;

            $("predictionNote").textContent =
                "Animal-related sound detected by YAMNet.";

            $("confidence").textContent =
                "Model score: " +
                (best.score * 100).toFixed(1) + "%";

        } else {
            const top = categories[0];

            $("animalName").textContent =
                top.categoryName || "Unknown Sound";

            $("predictionNote").textContent =
                "No animal-related category was found among the returned results.";

            $("confidence").textContent =
                "Top sound score: " +
                (top.score * 100).toFixed(1) + "%";
        }

    } catch (error) {
        console.error("Prediction error:", error);

        $("animalName").textContent = "Prediction Failed";
        $("predictionNote").textContent =
            "Could not classify this audio. Try another WAV or MP3 file.";
        $("confidence").textContent =
            "See the browser console for details.";
    }
}
