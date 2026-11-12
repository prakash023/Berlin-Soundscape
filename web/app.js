// ============================================================
// BERLIN SOUND MAP
// Animated Cultural Soundscape + Web Audio
// ============================================================


// ============================================================
// 1. SETUP DEBUG BOX
// ============================================================

const debugBox = document.createElement("div");

debugBox.style.cssText = `
    position: absolute;
    bottom: 20px;
    right: 20px;
    z-index: 9999;
    color: white;
    background: rgba(0, 0, 0, 0.85);
    padding: 15px;
    font-family: monospace;
    font-size: 12px;
    border: 1px solid #444;
    max-width: 400px;
    pointer-events: none;
    transition: opacity 0.5s ease;
`;

debugBox.innerHTML = `
    <strong>DEBUG LOG:</strong>
    <br>
    <ul id="log-list"
        style="margin: 5px 0; padding-left: 15px;">
        <li>Starting app...</li>
    </ul>
`;

document.body.appendChild(debugBox);


// ============================================================
// 2. LOGGER
// ============================================================

const log = (msg, color = "#fff") => {
    const li = document.createElement("li");

    li.style.color = color;
    li.innerText = msg;

    const list = document.getElementById("log-list");

    if (list) {
        list.appendChild(li);

        // Keep log to last 5 items
        if (list.children.length > 5) {
            list.removeChild(list.firstChild);
        }
    }
};


// ============================================================
// 3. NOW PLAYING PANEL & INSTRUCTION
// ============================================================

const nowPlayingPanel = document.createElement("div");

nowPlayingPanel.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 20px;
    z-index: 10;
    background: rgba(11, 11, 15, 0.92);
    border: 1px solid #333;
    border-left: 4px solid #333;
    padding: 16px 20px;
    font-family: monospace;
    color: white;
    min-width: 220px;
    display: none; /* Hidden until first click */
    box-shadow: 0 4px 20px rgba(0,0,0,0.6);
    border-radius: 4px;
    transition: opacity 0.3s ease;
`;

nowPlayingPanel.innerHTML = `
    <div style="font-size: 10px; letter-spacing: 2px; color: #888; margin-bottom: 6px;">
        NOW PLAYING
    </div>
    <div id="np-name" style="font-size: 18px; font-weight: bold; margin-bottom: 4px; word-wrap: break-word;">
        -
    </div>
    <div id="np-category" style="font-size: 11px; letter-spacing: 1px; display: flex; align-items: center; gap: 6px;">
        <span id="np-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #fff;"></span>
        <span id="np-cat-text">-</span>
    </div>
`;

const instructionPanel = document.createElement("div");

instructionPanel.style.cssText = `
    position: absolute;
    bottom: 20px;
    right: 20px;
    z-index: 10;
    background: rgba(11, 11, 15, 0.92);
    border: 1px solid #333;
    border-radius: 4px;
    padding: 16px 20px;
    font-family: monospace;
    color: white;
    max-width: 260px;
    transition: opacity 0.6s ease;
`;


instructionPanel.innerHTML = `
    <div style="font-size: 10px; letter-spacing: 2px; color: #888; margin-bottom: 8px;">
        BERLIN SOUND MAP
    </div>
    <div style="font-size: 13px; margin-bottom: 12px;">
        Click any glowing dot to hear that venue.
    </div>
    <div style="font-size: 11px; line-height: 1.9;">
        <span style="color:#FF2BD6;">●</span> Nightclub: kick and bass<br>
        <span style="color:#FF9F43;">●</span> Live music: guitar-like chord<br>
        <span style="color:#27D9FF;">●</span> Theatre: atmospheric drone
    </div>
`;

document.body.appendChild(instructionPanel);

// Fade the panel to a quieter state after the first venue click
function dimInstructionPanel() {
    instructionPanel.style.opacity = "0.45";
}

document.body.appendChild(nowPlayingPanel);

function updateNowPlaying(name, category, color) {
    document.getElementById("np-name").innerText = name;
    document.getElementById("np-cat-text").innerText = category.toUpperCase();
    document.getElementById("np-dot").style.background = color;
    
    nowPlayingPanel.style.borderLeftColor = color;
    nowPlayingPanel.style.display = "block";
}


// ============================================================
// 4. WEB AUDIO ENGINE
// ============================================================

let audioContext = null;
let masterGain = null;
let compressor = null;
let isAudioCoolingDown = false;


// ------------------------------------------------------------
// INITIALIZE AUDIO
// ------------------------------------------------------------

function initAudio() {

    if (!audioContext) {

        audioContext =
            new (window.AudioContext || window.webkitAudioContext)();

        // Compressor prevents clipping when several sounds
        // are triggered quickly.
        compressor = audioContext.createDynamicsCompressor();

        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;


        // Master volume
        masterGain = audioContext.createGain();

        masterGain.gain.value = 0.55;


        // Audio chain:
        //
        // individual sounds
        //       ↓
        // master gain
        //       ↓
        // compressor
        //       ↓
        // speakers

        masterGain.connect(compressor);
        compressor.connect(audioContext.destination);


        log(
            "Web Audio engine initialized.",
            "#55ffaa"
        );
    }


    // Browser autoplay protection
    if (audioContext.state === "suspended") {
        audioContext.resume();
    }
}


// ============================================================
// AUDIO HELPER FUNCTIONS
// ============================================================


// ------------------------------------------------------------
// MIDI → FREQUENCY
// ------------------------------------------------------------

function midiToFrequency(midi) {

    return 440 * Math.pow(
        2,
        (midi - 69) / 12
    );
}


// ------------------------------------------------------------
// STABLE PENTATONIC PITCH OFFSET (BASED ON VENUE NAME)
// ------------------------------------------------------------

function getVenuePitchOffset(venueName) {

    let nameHash = 0;

    for (const character of venueName) {
        nameHash = (nameHash * 31 + character.charCodeAt(0)) % 1000;
    }

    const majorPentatonicSemitones = [0, 2, 4, 7, 9];

    return majorPentatonicSemitones[nameHash % majorPentatonicSemitones.length];
}


// ------------------------------------------------------------
// CREATE OSCILLATOR
// ------------------------------------------------------------

function createOscillator(
    type,
    frequency,
    startTime,
    duration,
    volume
) {

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();


    osc.type = type;

    osc.frequency.setValueAtTime(
        frequency,
        startTime
    );


    gain.gain.setValueAtTime(
        0.0001,
        startTime
    );

    gain.gain.exponentialRampToValueAtTime(
        volume,
        startTime + 0.01
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        startTime + duration
    );


    osc.connect(gain);
    gain.connect(masterGain);


    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);


    return {
        oscillator: osc,
        gain: gain
    };
}


// ============================================================
// 5. CATEGORY SOUND GENERATORS
// ============================================================


// ============================================================
// 5A. NIGHTCLUB
// ============================================================

function playNightclubSound(semitoneOffset = 0) {

    initAudio();

    const now = audioContext.currentTime;


    // --------------------------------------------------------
    // DEEP KICK
    // --------------------------------------------------------

    const kickOsc =
        audioContext.createOscillator();

    const kickGain =
        audioContext.createGain();


    kickOsc.type = "sine";

    kickOsc.frequency.setValueAtTime(
        155,
        now
    );

    kickOsc.frequency.exponentialRampToValueAtTime(
        48,
        now + 0.12
    );


    kickGain.gain.setValueAtTime(
        0.0001,
        now
    );

    kickGain.gain.exponentialRampToValueAtTime(
        0.95,
        now + 0.008
    );

    kickGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.38
    );


    kickOsc.connect(kickGain);
    kickGain.connect(masterGain);


    kickOsc.start(now);
    kickOsc.stop(now + 0.42);


    // --------------------------------------------------------
    // SUB BASS
    // --------------------------------------------------------

    const subOsc =
        audioContext.createOscillator();

    const subGain =
        audioContext.createGain();


    subOsc.type = "sine";

    const variation =
        (Math.random() - 0.5) * 4;


    subOsc.frequency.setValueAtTime(
        55 * Math.pow(2, semitoneOffset / 12) + variation,
        now
    );


    subGain.gain.setValueAtTime(
        0.0001,
        now
    );

    subGain.gain.exponentialRampToValueAtTime(
        0.42,
        now + 0.025
    );

    subGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.55
    );


    subOsc.connect(subGain);
    subGain.connect(masterGain);


    subOsc.start(now);
    subOsc.stop(now + 0.6);


    // --------------------------------------------------------
    // ELECTRONIC ATTACK
    // --------------------------------------------------------

    const clickOsc =
        audioContext.createOscillator();

    const clickGain =
        audioContext.createGain();


    clickOsc.type = "square";


    clickOsc.frequency.setValueAtTime(
        1200 + Math.random() * 300,
        now
    );


    clickGain.gain.setValueAtTime(
        0.0001,
        now
    );

    clickGain.gain.exponentialRampToValueAtTime(
        0.12,
        now + 0.002
    );

    clickGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.035
    );


    clickOsc.connect(clickGain);
    clickGain.connect(masterGain);


    clickOsc.start(now);
    clickOsc.stop(now + 0.05);


    log(
        "Nightclub: kick + sub bass",
        "#FF2BD6"
    );
}


// ============================================================
// 5B. LIVE MUSIC
// ============================================================

function playLiveMusicSound(semitoneOffset = 0) {

    initAudio();

    const now = audioContext.currentTime;


    const notes = [
        60, // C
        64, // E
        67  // G
    ].map(note => note + semitoneOffset);


    notes.forEach((midi, index) => {

        const startTime =
            now + index * 0.055;


        const frequency =
            midiToFrequency(midi);


        const osc =
            audioContext.createOscillator();

        const gain =
            audioContext.createGain();


        osc.type = "triangle";


        const detune =
            (Math.random() - 0.5) * 7;


        osc.detune.setValueAtTime(
            detune,
            startTime
        );


        osc.frequency.setValueAtTime(
            frequency,
            startTime
        );


        gain.gain.setValueAtTime(
            0.0001,
            startTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.32,
            startTime + 0.025
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + 0.9
        );


        osc.connect(gain);
        gain.connect(masterGain);


        osc.start(startTime);
        osc.stop(startTime + 1.0);


        // ----------------------------------------------------
        // SECOND HARMONIC
        // ----------------------------------------------------

        const harmonic =
            audioContext.createOscillator();

        const harmonicGain =
            audioContext.createGain();


        harmonic.type = "sine";


        harmonic.frequency.setValueAtTime(
            frequency * 2,
            startTime
        );


        harmonicGain.gain.setValueAtTime(
            0.0001,
            startTime
        );

        harmonicGain.gain.exponentialRampToValueAtTime(
            0.07,
            startTime + 0.02
        );

        harmonicGain.gain.exponentialRampToValueAtTime(
            0.0001,
            startTime + 0.55
        );


        harmonic.connect(harmonicGain);
        harmonicGain.connect(masterGain);


        harmonic.start(startTime);
        harmonic.stop(startTime + 0.65);
    });


    log(
        "Live music: C major chord",
        "#FF9F43"
    );
}


// ============================================================
// 5C. THEATRE
// ============================================================

function playTheatreSound(semitoneOffset = 0) {

    initAudio();

    const now = audioContext.currentTime;


    // --------------------------------------------------------
    // MAIN LOW DRONE
    // --------------------------------------------------------

    const drone =
        audioContext.createOscillator();

    const droneGain =
        audioContext.createGain();

    const filter =
        audioContext.createBiquadFilter();


    drone.type = "sawtooth";

    const baseFrequency =
        midiToFrequency(48 + semitoneOffset);


    drone.frequency.setValueAtTime(
        baseFrequency,
        now
    );


    filter.type = "lowpass";

    filter.Q.value = 3;


    filter.frequency.setValueAtTime(
        120,
        now
    );

    filter.frequency.exponentialRampToValueAtTime(
        900,
        now + 0.9
    );

    filter.frequency.exponentialRampToValueAtTime(
        180,
        now + 1.8
    );


    droneGain.gain.setValueAtTime(
        0.0001,
        now
    );

    droneGain.gain.exponentialRampToValueAtTime(
        0.20,
        now + 0.35
    );

    droneGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 2.2
    );


    drone.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(masterGain);


    drone.start(now);
    drone.stop(now + 2.3);


    // --------------------------------------------------------
    // UPPER HARMONIC
    // --------------------------------------------------------

    const harmonic =
        audioContext.createOscillator();

    const harmonicGain =
        audioContext.createGain();


    harmonic.type = "sine";


    harmonic.frequency.setValueAtTime(
        baseFrequency * 1.5,
        now
    );


    harmonicGain.gain.setValueAtTime(
        0.0001,
        now
    );

    harmonicGain.gain.exponentialRampToValueAtTime(
        0.11,
        now + 0.5
    );

    harmonicGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 2.0
    );


    harmonic.connect(harmonicGain);
    harmonicGain.connect(masterGain);


    harmonic.start(now);
    harmonic.stop(now + 2.1);


    log(
        "Theatre: atmospheric drone",
        "#27D9FF"
    );
}


// ============================================================
// CATEGORY ROUTER
// ============================================================

function playCategorySound(category, semitoneOffset = 0) {

    if (category === "nightclub") {

        playNightclubSound(semitoneOffset);

    } else if (category === "live") {

        playLiveMusicSound(semitoneOffset);

    } else if (category === "theatre") {

        playTheatreSound(semitoneOffset);
    }
}


// ============================================================
// 6. GLOBAL SOUND FIELD SETTINGS
// ============================================================

const soundFields = {

    nightclub: {

        color: "#FF2BD6",

        speed: 1.00,

        maxRadius: 58,

        minOpacity: 0.10,

        maxOpacity: 0.78,

        baseWidth: 1.15
    },


    live: {

        color: "#FF9F43",

        speed: 0.68,

        maxRadius: 54,

        minOpacity: 0.10,

        maxOpacity: 0.68,

        baseWidth: 1.10
    },


    theatre: {

        color: "#27D9FF",

        speed: 0.36,

        maxRadius: 68,

        minOpacity: 0.08,

        maxOpacity: 0.58,

        baseWidth: 0.95
    }
};


// ============================================================
// 7. ANIMATED VENUE REGISTRY & ACTIVE WAVES
// ============================================================

const animatedVenues = [];

const activeClickWaves = [];


// ============================================================
// 8. MAP LOAD
// ============================================================

const map = new maplibregl.Map({

    container: "map",

    style: {

        version: 8,

        sources: {},

        layers: [

            {
                id: "bg",

                type: "background",

                paint: {
                    "background-color": "#0B0B0B"
                }
            }
        ]
    },

    center: [
        13.4050,
        52.5200
    ],

    zoom: 10.7,

    pitch: 0
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");


map.on("load", async () => {

    log(
        "Map loaded.",
        "#55ffaa"
    );


    // ========================================================
    // 9. BUILDING TEXTURE
    // ========================================================

    map.addSource(
        "berlin-texture",
        {
            type: "image",

            url: "data/berlin_buildings.png",

            coordinates: [

                [
                    13.09217269146297,
                    52.678710773852664
                ],

                [
                    13.753819950277732,
                    52.678710773852664
                ],

                [
                    13.753819950277732,
                    52.33092713671613
                ],

                [
                    13.09217269146297,
                    52.33092713671613
                ]
            ]
        }
    );


    map.addLayer({

        id: "berlin-texture-layer",

        type: "raster",

        source: "berlin-texture",

        paint: {

            "raster-opacity": 1.0,

            "raster-fade-duration": 0,

            "raster-brightness-min": 0.0,

            "raster-brightness-max": 1.0,

            "raster-contrast": 0.0
        }
    });


    // ========================================================
    // 10. BERLIN BOUNDARY
    // ========================================================

    map.addSource(
        "boundary",
        {
            type: "geojson",

            data: "data/berlin_boundary.geojson"
        }
    );


    map.addLayer({

        id: "boundary-line",

        type: "line",

        source: "boundary",

        paint: {

            "line-color": "#666666",

            "line-width": 2,

            "line-opacity": 0.8
        }
    });


    // ========================================================
    // 11. LOAD VENUE DATA
    // ========================================================

    try {

        const nightclubData =
            await fetch(
                "data/sound_nightclubs.geojson"
            ).then(
                r => r.json()
            );


        const liveData =
            await fetch(
                "data/sound_live_music.geojson"
            ).then(
                r => r.json()
            );


        const theatreData =
            await fetch(
                "data/sound_theatre.geojson"
            ).then(
                r => r.json()
            );


        log(

            `Venues loaded: ${
                nightclubData.features.length +
                liveData.features.length +
                theatreData.features.length
            }`,

            "#55ffaa"
        );


        // ====================================================
        // 12. CREATE VENUE POINT LAYERS
        // ====================================================


        map.addSource(
            "nc",
            {
                type: "geojson",

                data: nightclubData
            }
        );


        map.addLayer({

            id: "nc-points",

            type: "circle",

            source: "nc",

            paint: {

                "circle-color": "#FF2BD6",

                "circle-radius": 5,

                "circle-opacity": 0.95,

                "circle-stroke-width": 1,

                "circle-stroke-color": "#FFFFFF",

                "circle-stroke-opacity": 0.65
            }
        });


        map.addSource(
            "live",
            {
                type: "geojson",

                data: liveData
            }
        );


        map.addLayer({

            id: "live-points",

            type: "circle",

            source: "live",

            paint: {

                "circle-color": "#FF9F43",

                "circle-radius": 4,

                "circle-opacity": 0.95,

                "circle-stroke-width": 1,

                "circle-stroke-color": "#FFFFFF",

                "circle-stroke-opacity": 0.65
            }
        });


        map.addSource(
            "theatre",
            {
                type: "geojson",

                data: theatreData
            }
        );


        map.addLayer({

            id: "theatre-points",

            type: "circle",

            source: "theatre",

            paint: {

                "circle-color": "#27D9FF",

                "circle-radius": 4,

                "circle-opacity": 0.95,

                "circle-stroke-width": 1,

                "circle-stroke-color": "#FFFFFF",

                "circle-stroke-opacity": 0.65
            }
        });


        // ====================================================
        // 13. VENUE PICKING (GENEROUS HIT AREA)
        // ====================================================

        const venueLayerIds = ["nc-points", "live-points", "theatre-points"];

        const categoryByLayerId = {
            "nc-points": "nightclub",
            "live-points": "live",
            "theatre-points": "theatre"
        };

        const hitRadiusInPixels = 14;

        function findNearestVenueFeature(screenPoint) {

            const searchBox = [
                [screenPoint.x - hitRadiusInPixels, screenPoint.y - hitRadiusInPixels],
                [screenPoint.x + hitRadiusInPixels, screenPoint.y + hitRadiusInPixels]
            ];

            const nearbyFeatures = map.queryRenderedFeatures(searchBox, {
                layers: venueLayerIds
            });

            if (nearbyFeatures.length === 0) return null;

            let nearestFeature = null;
            let nearestDistance = Infinity;

            nearbyFeatures.forEach(feature => {
                const featureScreenPoint = map.project(feature.geometry.coordinates);
                const distance = Math.hypot(
                    featureScreenPoint.x - screenPoint.x,
                    featureScreenPoint.y - screenPoint.y
                );

                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestFeature = feature;
                }
            });

            return nearestFeature;
        }


        // ====================================================
        // 14. VENUE CLICK & HOVER INTERACTION
        // ====================================================

        function handleVenueClick(venueFeature, category) {

            if (isAudioCoolingDown) return;
            isAudioCoolingDown = true;
            setTimeout(() => { isAudioCoolingDown = false; }, 150);

            const venueName = venueFeature.properties.name || "Unnamed Venue";
            const venueCoordinates = venueFeature.geometry.coordinates;

            playCategorySound(category, getVenuePitchOffset(venueName));

            activeClickWaves.push({
                longitude: venueCoordinates[0],
                latitude: venueCoordinates[1],
                color: soundFields[category].color,
                startTime: performance.now()
            });

            updateNowPlaying(venueName, category, soundFields[category].color);
            dimInstructionPanel();
        }


        map.on("click", (event) => {

            const venueFeature = findNearestVenueFeature(event.point);
            if (!venueFeature) return;

            const category = categoryByLayerId[venueFeature.layer.id];
            handleVenueClick(venueFeature, category);
        });


        // ----------------------------------------------------
        // HOVER TOOLTIP
        // ----------------------------------------------------

        const hoverTooltip = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 14
        });


        map.on("mousemove", (event) => {

            const venueFeature = findNearestVenueFeature(event.point);

            if (!venueFeature) {
                map.getCanvas().style.cursor = "";
                hoverTooltip.remove();
                return;
            }

            map.getCanvas().style.cursor = "pointer";

            const venueName = venueFeature.properties.name || "Unnamed venue";

            hoverTooltip
                .setLngLat(venueFeature.geometry.coordinates)
                .setHTML(`<strong>${venueName}</strong><br><small>click to listen</small>`)
                .addTo(map);
        });


        // ====================================================
        // 15. BUILD ANIMATED VENUE REGISTRY
        // ====================================================

        function registerVenues(
            features,
            type
        ) {

            features.forEach(
                (feature, index) => {

                    const coordinates =
                        feature.geometry.coordinates;


                    const settings =
                        soundFields[type];


                    const variation =
                        0.82 +
                        (
                            (index * 37) % 31
                        ) / 100;


                    animatedVenues.push({

                        longitude:
                            coordinates[0],

                        latitude:
                            coordinates[1],

                        type:
                            type,

                        color:
                            settings.color,

                        speed:
                            settings.speed *
                            variation,

                        maxRadius:
                            settings.maxRadius *
                            (
                                0.88 +
                                (
                                    (index * 19) % 25
                                ) / 100
                            ),

                        minOpacity:
                            settings.minOpacity,

                        maxOpacity:
                            settings.maxOpacity,

                        baseWidth:
                            settings.baseWidth,

                        phase:
                            (
                                index * 0.731
                            ) %
                            (
                                Math.PI * 2
                            ),

                        waveOffset:
                            0.28 +
                            (
                                (index * 13) % 18
                            ) / 100,

                        name:
                            feature.properties?.name
                            ||
                            "Unnamed venue"
                    });
                }
            );
        }


        registerVenues(
            nightclubData.features,
            "nightclub"
        );


        registerVenues(
            liveData.features,
            "live"
        );


        registerVenues(
            theatreData.features,
            "theatre"
        );


        log(

            `Animated sound fields: ${animatedVenues.length}`,

            "#55ffaa"
        );

    }

    catch (error) {

        log(
            "Error loading GeoJSON: " +
            error.message,

            "#ff4444"
        );
    }


    // ========================================================
    // 16. CREATE CANVAS OVERLAY
    // ========================================================

    const canvas =
        document.createElement(
            "canvas"
        );


    canvas.id =
        "sound-field-canvas";


    canvas.style.position =
        "absolute";


    canvas.style.top =
        "0";


    canvas.style.left =
        "0";


    canvas.style.width =
        "100%";


    canvas.style.height =
        "100%";


    canvas.style.pointerEvents =
        "none";


    canvas.style.zIndex =
        "2";


    map.getContainer()
        .appendChild(canvas);


    const ctx =
        canvas.getContext("2d");


    function resizeCanvas() {

        const rect =
            map.getContainer()
                .getBoundingClientRect();


        const pixelRatio =
            window.devicePixelRatio ||
            1;


        canvas.width =
            rect.width *
            pixelRatio;


        canvas.height =
            rect.height *
            pixelRatio;


        ctx.setTransform(
            pixelRatio,
            0,
            0,
            pixelRatio,
            0,
            0
        );
    }


    resizeCanvas();


    window.addEventListener(
        "resize",
        resizeCanvas
    );


    map.on(
        "resize",
        resizeCanvas
    );


    // ========================================================
    // 18. DRAW SOUND FIELDS
    // ========================================================

    function drawSoundFields(
        timestamp
    ) {

        // Schedule the next frame immediately.
        // This guarantees the loop survives any drawing errors.
        requestAnimationFrame(
            drawSoundFields
        );

        const width =
            canvas.clientWidth;


        const height =
            canvas.clientHeight;


        ctx.clearRect(
            0,
            0,
            width,
            height
        );


        const time =
            timestamp * 0.001;


        // ----------------------------------------------------
        // DRAW CLICK WAVES
        // ----------------------------------------------------

        for (
            let i =
                activeClickWaves.length - 1;

            i >= 0;

            i--
        ) {

            const wave =
                activeClickWaves[i];


            // Clamp age to prevent negative radius errors
            const age =
                Math.max(0, (timestamp - wave.startTime) / 1000);


            // Duration of 2.5 seconds for a lingering pulse
            const duration =
                2.5;


            if (
                age > duration
            ) {

                activeClickWaves.splice(
                    i,
                    1
                );

                continue;
            }


            const progress =
                age /
                duration;


            // Starts at 10px, expands to 250px
            const radius =
                10 + (progress * 240);


            const opacity =
                1 -
                progress;

            // Convert geographic coordinates to current screen pixels
            const screenPoint = map.project([wave.longitude, wave.latitude]);

            ctx.beginPath();


            ctx.arc(
                screenPoint.x,
                screenPoint.y,
                radius,
                0,
                Math.PI * 2
            );


            ctx.strokeStyle =
                wave.color;


            ctx.globalAlpha =
                opacity;


            // Thinner line for elegance
            ctx.lineWidth =
                3;


            ctx.stroke();
        }

        // Reset globalAlpha after click waves
        ctx.globalAlpha = 1.0;


        // ----------------------------------------------------
        // DRAW EVERY VENUE
        // ----------------------------------------------------

        animatedVenues.forEach(
            venue => {

                const point =
                    map.project([
                        venue.longitude,
                        venue.latitude
                    ]);


                if (
                    point.x < -150 ||
                    point.x > width + 150 ||
                    point.y < -150 ||
                    point.y > height + 150
                ) {

                    return;
                }


                const cycle =
                    (
                        time *
                        venue.speed +
                        venue.phase
                    ) % 1.0;


                const waves = [

                    {
                        phase:
                            cycle,

                        width:
                            1.0,

                        opacity:
                            1.0
                    },

                    {
                        phase:
                            (
                                cycle +
                                venue.waveOffset
                            ) % 1.0,

                        width:
                            0.82,

                        opacity:
                            0.55
                    },

                    {
                        phase:
                            (
                                cycle +
                                venue.waveOffset * 2
                            ) % 1.0,

                        width:
                            0.65,

                        opacity:
                            0.32
                    }
                ];


                waves.forEach(
                    wave => {

                        const smoothPhase =
                            wave.phase *
                            wave.phase *
                            (
                                3 -
                                2 *
                                wave.phase
                            );


                        const radius =
                            5 +
                            smoothPhase *
                            venue.maxRadius *
                            wave.width;


                        const fade =
                            Math.pow(
                                1 -
                                wave.phase,
                                1.8
                            );


                        const opacity =
                            venue.minOpacity +
                            (
                                venue.maxOpacity -
                                venue.minOpacity
                            ) *
                            fade *
                            wave.opacity;


                        const lineWidth =
                            Math.max(
                                0.45,
                                venue.baseWidth *
                                (
                                    1.15 -
                                    wave.phase *
                                    0.55
                                )
                            );


                        ctx.beginPath();


                        ctx.arc(
                            point.x,
                            point.y,
                            radius,
                            0,
                            Math.PI * 2
                        );


                        ctx.strokeStyle =
                            venue.color;


                        ctx.globalAlpha =
                            opacity;


                        ctx.lineWidth =
                            lineWidth;


                        ctx.stroke();
                    }
                );


                // ------------------------------------------------
                // CORE PULSE
                // ------------------------------------------------

                const pulse =
                    (
                        Math.sin(
                            time *
                            venue.speed *
                            Math.PI *
                            2 +
                            venue.phase
                        ) +
                        1
                    ) / 2;


                const coreRadius =
                    3.2 +
                    pulse *
                    1.8;


                const coreOpacity =
                    0.60 +
                    pulse *
                    0.30;


                // Outer glow

                ctx.beginPath();


                ctx.arc(
                    point.x,
                    point.y,
                    coreRadius * 2.8,
                    0,
                    Math.PI * 2
                );


                ctx.fillStyle =
                    venue.color;


                ctx.globalAlpha =
                    coreOpacity *
                    0.12;


                ctx.fill();


                // Inner point

                ctx.beginPath();


                ctx.arc(
                    point.x,
                    point.y,
                    coreRadius,
                    0,
                    Math.PI * 2
                );


                ctx.fillStyle =
                    venue.color;


                ctx.globalAlpha =
                    coreOpacity;


                ctx.fill();
            }
        );


        ctx.globalAlpha =
            1.0;


        ctx.lineWidth =
            1;
    }


    // Start the loop
    requestAnimationFrame(drawSoundFields);


    // ========================================================
    // 19. FINISHED
    // ========================================================

    log(
        "Interactive soundscape running.",
        "#55ffaa"
    );


    setTimeout(() => {

        debugBox.style.opacity =
            "0";

    }, 4000);
});