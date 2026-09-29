"""Natural-language pit risk explanations in English, Tamil and Hindi.

Each explanation is ONE conversational sentence that describes what is holding a
pit back and folds the suggested action into the same sentence, rather than
listing a cause and then a separate instruction. Several phrasings are stored per
scenario so that neighbouring pits (and repeated requests) do not read
identically.

Scenarios are decided by the dominant risk driver:
    downtime / rainfall / delay / richness / combined  (risk Medium or High)
    low                                                (risk Low)

Templates are written to sound natural in each language rather than being
word-for-word translations of the English.
"""

import random

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = ("en", "ta", "hi")

SCENARIOS = ("downtime", "rainfall", "delay", "richness", "combined", "low")

TEMPLATES = {
    "en": {
        "downtime": [
            "Equipment has been down more than usual here and that is really what "
            "is holding this block back, so it is worth servicing the machines and "
            "moving spare units in from the quieter zones.",
            "This block is losing time mainly because the equipment has been "
            "offline a fair bit lately, so a round of maintenance and a bit of "
            "machinery reshuffling should clear most of it.",
            "Most of the strain here comes from machines being out of action more "
            "often than they should be, so prioritising repairs and borrowing "
            "equipment from low-priority areas would get things moving again.",
        ],
        "rainfall": [
            "Heavy rain is the main thing working against this block right now, so "
            "it would be best to pause outdoor work and shift blasting to a drier "
            "stretch.",
            "Wet weather has been slowing this zone down, so holding off on outdoor "
            "operations and waiting for a clearer spell to blast would help.",
            "The rain has been heavier than this block can comfortably work "
            "through, so rescheduling blasting and outdoor activity for drier days "
            "is the practical fix.",
        ],
        "delay": [
            "Blasting delays are what is eating into this block's output, so "
            "smoothing out the blast schedule would recover most of the lost time.",
            "This zone is being held back by long waits between blasts, so "
            "tightening up the scheduling should make a real difference.",
            "The gaps in the blasting sequence are the main problem here, so "
            "getting the detonation timing under better control would help "
            "considerably.",
        ],
        "richness": [
            "The ore in this block is leaner than the rest of the area, which is "
            "why output looks weak here, so it is worth rebalancing the plan and "
            "leaning on the richer zones.",
            "This zone simply is not as mineral-rich as its neighbours, so shifting "
            "the workload towards better blocks would give a healthier result.",
            "Lower ore richness is the real reason this block falls short, so it "
            "may be better to reallocate effort to the more promising ground "
            "nearby.",
        ],
        "combined": [
            "This block is being squeezed by a mix of factors at once, with "
            "equipment, weather and blasting all pulling in the same direction, so "
            "the best approach is to adjust the schedule and equipment allocation "
            "together.",
            "There is no single culprit here, as several things are combining to "
            "slow this zone down, so a coordinated change to both scheduling and "
            "machinery is what is needed.",
            "A combination of operational and geological pressures is weighing on "
            "this block, so it makes sense to tackle the schedule and equipment "
            "plan as one effort.",
        ],
        "low": [
            "Things look steady in this zone right now, with equipment, weather and "
            "blasting all behaving, so there is nothing that needs changing at the "
            "moment.",
            "This block is in good shape, with no real pressure from equipment, "
            "rainfall or blasting, so it can carry on as planned.",
            "Everything is running close to normal here, so no action is needed for "
            "this pit right now.",
        ],
    },
    "ta": {
        "downtime": [
            "இந்தப் பகுதியில் இயந்திரங்கள் வழக்கத்தை விட அதிகமாக செயலிழந்துள்ளன; "
            "அதுவே இங்கு உற்பத்தியைத் தடுக்கிறது, எனவே இயந்திரங்களைப் பராமரித்து, "
            "குறைந்த முன்னுரிமைப் பகுதிகளிலிருந்து மாற்று உபகரணங்களைக் கொண்டு "
            "வருவது நல்லது.",
            "இயந்திரங்கள் அடிக்கடி நிறுத்தப்படுவதால் இந்தப் பகுதி நேரத்தை "
            "இழக்கிறது, எனவே ஒரு பராமரிப்புச் சுற்று நடத்தி, சில இயந்திரங்களை "
            "மறுசீரமைத்தால் பெரும்பாலான பிரச்சினை தீரும்.",
            "தேவையானதை விட அதிகமாக இயந்திரங்கள் செயல்படாமல் இருப்பதே இங்குள்ள "
            "முக்கிய சிக்கல், எனவே பழுதுபார்ப்புக்கு முன்னுரிமை அளித்து, மற்ற "
            "பகுதிகளிலிருந்து உபகரணங்களைக் கொண்டு வருவது நிலைமையை மேம்படுத்தும்.",
        ],
        "rainfall": [
            "கனமழையே இப்பகுதிக்கு முக்கிய தடையாக உள்ளது, எனவே வெளிப்புற வேலைகளைச் "
            "சிறிது நேரம் நிறுத்தி, வெயில் அடித்த நாட்களுக்கு வெடிப்பு வேலைகளை "
            "மாற்றுவது சிறந்தது.",
            "மழை இந்தப் பகுதியின் வேகத்தைக் குறைத்துள்ளது, எனவே வெளிப்புறச் "
            "செயல்பாடுகளைத் தள்ளிப்போட்டு, தெளிவான நாளில் வெடிப்பு நடத்துவது "
            "உதவும்.",
            "இந்தப் பகுதியால் எளிதில் சமாளிக்க முடியாத அளவுக்கு மழை அதிகமாக "
            "உள்ளது, எனவே வறண்ட நாட்களுக்கு வெடிப்பு மற்றும் வெளிப்புற வேலைகளை "
            "மாற்றுவதே நடைமுறைத் தீர்வு.",
        ],
        "delay": [
            "வெடிப்பு தாமதங்களே இந்தப் பகுதியின் வெளியீட்டைக் குறைக்கின்றன, எனவே "
            "வெடிப்பு அட்டவணையைச் சீராக்கினால் இழந்த நேரத்தை மீட்டெடுக்கலாம்.",
            "வெடிப்புகளுக்கு இடையிலான நீண்ட காத்திருப்பே இந்தப் பகுதியைப் "
            "பின்தள்ளுகிறது, எனவே அட்டவணையை இறுக்கமாக்குவது உண்மையில் "
            "மாற்றத்தைத் தரும்.",
            "வெடிப்பு வரிசையில் ஏற்படும் இடைவெளிகளே இங்குள்ள முக்கிய பிரச்சினை, "
            "எனவே வெடிக்கும் நேரத்தைச் சிறப்பாக நிர்வகித்தால் நிலைமை மேம்படும்.",
        ],
        "richness": [
            "இந்தப் பகுதியின் தாது மற்ற பகுதிகளை விட மெலிதானது; அதனால்தான் இங்கு "
            "உற்பத்தி குறைவாகத் தெரிகிறது, எனவே திட்டத்தைச் சரிசெய்து செழுமையான "
            "பகுதிகளுக்கு முன்னுரிமை அளிப்பது நல்லது.",
            "இந்த மண்டலம் அருகிலுள்ள பகுதிகளைப் போல தாதுச் செறிவு பெற்றதல்ல, எனவே "
            "சிறந்த பகுதிகளுக்கு வேலையை மாற்றினால் ஆரோக்கியமான விளைவு கிடைக்கும்.",
            "தாதுச் செறிவு குறைவே இந்தப் பகுதி பின்தங்குவதற்கு உண்மையான காரணம், "
            "எனவே அருகிலுள்ள நம்பிக்கைக்குரிய இடங்களுக்கு முயற்சியை மாற்றுவது "
            "நல்லது.",
        ],
        "combined": [
            "இந்தப் பகுதியில் பல காரணிகள் ஒரே நேரத்தில் அழுத்தம் தருகின்றன; "
            "இயந்திரம், வானிலை, வெடிப்பு அனைத்தும் சேர்ந்து செயல்படுகின்றன, எனவே "
            "அட்டவணையையும் இயந்திர ஒதுக்கீட்டையும் ஒன்றாகச் சரிசெய்வதே சிறந்த வழி.",
            "இங்கு ஒரே ஒரு காரணம் இல்லை; பல விஷயங்கள் சேர்ந்து இந்தப் பகுதியை "
            "மெதுவாக்குகின்றன, எனவே அட்டவணை மற்றும் இயந்திரத் திட்டத்தை "
            "ஒருங்கிணைந்து மாற்றுவது தேவை.",
            "செயல்பாட்டு மற்றும் புவியியல் அழுத்தங்களின் கலவை இந்தப் பகுதியைப் "
            "பாதிக்கிறது, எனவே அட்டவணையையும் உபகரணத் திட்டத்தையும் ஒரே முயற்சியாகக் "
            "கையாள்வது நல்லது.",
        ],
        "low": [
            "இந்தப் பகுதியில் இப்போது நிலைமை சீராக உள்ளது; இயந்திரம், வானிலை, "
            "வெடிப்பு அனைத்தும் சரியாக நடக்கின்றன, எனவே இப்போதைக்கு எதையும் மாற்ற "
            "வேண்டியதில்லை.",
            "இந்தப் பகுதி நல்ல நிலையில் உள்ளது; இயந்திரம், மழை அல்லது வெடிப்பில் "
            "பெரிய அழுத்தம் இல்லை, எனவே திட்டமிட்டபடி தொடரலாம்.",
            "இங்கு எல்லாம் வழக்கமான அளவில் நடக்கிறது, எனவே இந்தப் பகுதிக்கு "
            "இப்போது எந்த நடவடிக்கையும் தேவையில்லை.",
        ],
    },
    "hi": {
        "downtime": [
            "यहाँ मशीनें आम दिनों से ज़्यादा बंद रही हैं और यही इस ब्लॉक की रफ़्तार "
            "रोक रहा है, इसलिए मशीनों की सर्विसिंग कराना और कम प्राथमिकता वाले "
            "क्षेत्रों से अतिरिक्त उपकरण यहाँ भेजना फ़ायदेमंद रहेगा।",
            "इस ब्लॉक का समय मुख्य रूप से इसलिए बर्बाद हो रहा है क्योंकि उपकरण "
            "काफ़ी बार बंद पड़े रहे, इसलिए एक बार रखरखाव करा लेने और मशीनरी थोड़ी "
            "इधर-उधर करने से ज़्यादातर समस्या हल हो जाएगी।",
            "यहाँ सबसे बड़ी अड़चन यह है कि मशीनें ज़रूरत से ज़्यादा बार ख़राब हो "
            "रही हैं, इसलिए मरम्मत को प्राथमिकता देना और दूसरे क्षेत्रों से उपकरण "
            "मंगाना सबसे कारगर कदम होगा।",
        ],
        "rainfall": [
            "इस ब्लॉक के सामने सबसे बड़ी चुनौती भारी बारिश है, इसलिए बाहरी काम कुछ "
            "समय रोककर ब्लास्टिंग को सूखे दिनों में शिफ़्ट कर देना बेहतर होगा।",
            "बारिश ने इस क्षेत्र की गति धीमी कर दी है, इसलिए बाहरी गतिविधियाँ "
            "टालकर साफ़ मौसम में ब्लास्टिंग करना मदद करेगा।",
            "यहाँ बारिश उस स्तर से ज़्यादा है जितना यह ब्लॉक आसानी से संभाल सकता है, "
            "इसलिए ब्लास्टिंग और बाहरी काम सूखे दिनों के लिए टाल देना ही "
            "व्यावहारिक हल है।",
        ],
        "delay": [
            "ब्लास्टिंग में होने वाली देरी ही इस ब्लॉक के उत्पादन को खा रही है, "
            "इसलिए ब्लास्ट शेड्यूल को सुव्यवस्थित करने से खोया समय वापस मिल सकता है।",
            "ब्लास्ट के बीच लंबा इंतज़ार इस क्षेत्र को पीछे खींच रहा है, इसलिए "
            "शेड्यूल को कसने से असली फ़र्क़ पड़ेगा।",
            "ब्लास्टिंग के क्रम में पड़ने वाले अंतराल यहाँ की मुख्य समस्या हैं, इसलिए "
            "विस्फोट का समय बेहतर तरीके से तय करने से स्थिति सुधरेगी।",
        ],
        "richness": [
            "इस ब्लॉक का अयस्क आसपास के मुकाबले कमज़ोर है, इसीलिए यहाँ उत्पादन कम "
            "दिख रहा है, इसलिए योजना को संतुलित करके समृद्ध क्षेत्रों पर ज़ोर देना "
            "उचित होगा।",
            "यह क्षेत्र पड़ोसी ब्लॉकों जितना खनिज-समृद्ध नहीं है, इसलिए काम का बोझ "
            "बेहतर ब्लॉकों की ओर मोड़ने से सेहतमंद नतीजा मिलेगा।",
            "कम अयस्क समृद्धि ही इस ब्लॉक के पीछे रहने की असली वजह है, इसलिए आसपास "
            "के अधिक संभावनाशील क्षेत्रों की ओर प्रयास मोड़ना बेहतर होगा।",
        ],
        "combined": [
            "इस ब्लॉक पर एक साथ कई कारण दबाव डाल रहे हैं; उपकरण, मौसम और ब्लास्टिंग "
            "सब मिलकर असर कर रहे हैं, इसलिए शेड्यूल और उपकरण आवंटन दोनों को साथ में "
            "ठीक करना सबसे अच्छा रास्ता है।",
            "यहाँ कोई एक वजह नहीं है; कई चीज़ें मिलकर इस क्षेत्र को धीमा कर रही हैं, "
            "इसलिए शेड्यूल और मशीनरी योजना को एक साथ बदलना ज़रूरी है।",
            "परिचालन और भूवैज्ञानिक दबावों का मेल इस ब्लॉक पर भारी पड़ रहा है, इसलिए "
            "शेड्यूल और उपकरण योजना को एक ही प्रयास में संभालना चाहिए।",
        ],
        "low": [
            "इस क्षेत्र में अभी हालात स्थिर हैं; उपकरण, मौसम और ब्लास्टिंग सब ठीक चल "
            "रहे हैं, इसलिए इस समय कुछ बदलने की ज़रूरत नहीं है।",
            "यह ब्लॉक अच्छी स्थिति में है; उपकरण, बारिश या ब्लास्टिंग से कोई बड़ा "
            "दबाव नहीं है, इसलिए योजना के मुताबिक काम जारी रख सकते हैं।",
            "यहाँ सब कुछ सामान्य स्तर पर चल रहा है, इसलिए इस पिट के लिए अभी कोई "
            "कार्रवाई ज़रूरी नहीं है।",
        ],
    },
}


# --- Whole-mine weekly target explanations -----------------------------------
# Same scenario keys and natural-first style as the pit templates, but written
# about the MINE against a weekly target and parameterised with {target} (the
# target in tonnes). Used by /api/weekly-target-prediction.
TARGET_TEMPLATES = {
    "en": {
        "downtime": [
            "The weekly target of {target} tonnes is out of reach mainly because "
            "equipment has been down more than usual, so the fastest win is to "
            "service the machines and move spare units in from lower-priority "
            "areas.",
            "Most of the gap to {target} tonnes a week comes from machines sitting "
            "idle, so prioritising repairs and reallocating equipment would recover "
            "the shortfall.",
            "Equipment availability is what is keeping the mine short of its "
            "{target}-tonne weekly target, so a maintenance push and some machinery "
            "reshuffling should close most of the gap.",
        ],
        "rainfall": [
            "Heavy rain is the main reason the mine falls short of {target} tonnes "
            "this week, so pausing outdoor work and moving blasting to drier spells "
            "is the practical fix.",
            "Wet weather is doing most of the damage to the {target}-tonne weekly "
            "target, so it is worth rescheduling blasting and outdoor operations for "
            "drier days.",
            "Rain is holding production below its {target}-tonne weekly target, so "
            "shifting blasting to clearer weather would help most.",
        ],
        "delay": [
            "Blast delays are the biggest reason the mine misses its {target}-tonne "
            "weekly target, so smoothing the blast schedule would recover most of "
            "the shortfall.",
            "Long waits between blasts are driving the gap to {target} tonnes a "
            "week, so tightening the detonation schedule is the priority.",
            "The blasting sequence is the main drag on this week's {target}-tonne "
            "target, so getting the timing under control would help most.",
        ],
        "richness": [
            "The {target}-tonne weekly target is above what this reserve base can "
            "deliver even under good conditions, since the ore richness across the "
            "pits is only moderate, so the target is better rebalanced towards the "
            "richer blocks.",
            "Even with equipment, weather and blasting behaving, the pit reserves "
            "here cannot support {target} tonnes a week, so the shortfall really "
            "comes down to relying on richer ground.",
            "Limited reserve richness, not operations, is what puts {target} tonnes "
            "a week out of reach, so effort is best focused on the more promising "
            "pits.",
        ],
        "combined": [
            "The mine is short of its {target}-tonne weekly target because of a mix "
            "of equipment downtime, rainfall and blast delays at once, so the "
            "schedule and equipment allocation need to be adjusted together.",
            "No single factor explains the gap to {target} tonnes a week - "
            "equipment, weather and blasting are all pulling in the same direction, "
            "so a coordinated fix is needed.",
            "Several pressures are combining to keep output below the {target}-tonne "
            "weekly target, so it makes sense to tackle scheduling and machinery as "
            "one effort.",
        ],
        "ontrack": [
            "Output is on track against the {target}-tonne weekly target, with "
            "equipment, weather and blasting all close to normal, so no corrective "
            "action is needed.",
            "The mine is meeting its {target}-tonne weekly target comfortably, so "
            "there is nothing that needs changing right now.",
            "Production is holding at or above the {target}-tonne weekly target, so "
            "this week needs no intervention.",
        ],
    },
    "ta": {
        "downtime": [
            "இயந்திரங்கள் வழக்கத்தை விட அதிகமாக செயலிழந்துள்ளதால், வாரத்திற்கு "
            "{target} டன் என்ற இலக்கை எட்ட முடியவில்லை; எனவே இயந்திரங்களைப் "
            "பராமரித்து, குறைந்த முன்னுரிமைப் பகுதிகளிலிருந்து மாற்று உபகரணங்களைக் "
            "கொண்டு வருவதே விரைவான தீர்வு.",
            "{target} டன் என்ற வார இலக்கிற்கும் தற்போதைய உற்பத்திக்கும் உள்ள "
            "பெரும்பாலான இடைவெளி இயந்திரங்கள் செயல்படாமல் இருப்பதால்தான் "
            "ஏற்படுகிறது, எனவே பழுதுபார்ப்புக்கு முன்னுரிமை அளித்து உபகரணங்களை "
            "மறுசீரமைத்தால் பற்றாக்குறையை ஈடுசெய்யலாம்.",
            "இயந்திரங்கள் கிடைப்பதில் உள்ள சிக்கலே {target} டன் வார இலக்கை "
            "எட்டவிடாமல் தடுக்கிறது, எனவே பராமரிப்புப் பணியும் சில இயந்திர "
            "மாற்றங்களும் பெரும்பாலான இடைவெளியை நிரப்பும்.",
        ],
        "rainfall": [
            "கனமழையே இந்த வாரம் {target} டன் என்ற இலக்கை எட்டவிடாமல் தடுக்கும் "
            "முக்கிய காரணம், எனவே வெளிப்புற வேலைகளை நிறுத்தி, வெயில் நாட்களுக்கு "
            "வெடிப்பு வேலைகளை மாற்றுவதே நடைமுறைத் தீர்வு.",
            "மழையே {target} டன் வார இலக்கிற்கு அதிக பாதிப்பை ஏற்படுத்துகிறது, "
            "எனவே வெடிப்பு மற்றும் வெளிப்புற வேலைகளை வறண்ட நாட்களுக்கு மாற்றுவது "
            "நல்லது.",
            "மழை காரணமாக உற்பத்தி {target} டன் இலக்கிற்குக் கீழே உள்ளது, எனவே "
            "தெளிவான வானிலைக்கு வெடிப்பு வேலைகளை மாற்றுவது அதிகம் உதவும்.",
        ],
        "delay": [
            "வெடிப்பு தாமதங்களே {target} டன் வார இலக்கைத் தவறவிடுவதற்கு முக்கிய "
            "காரணம், எனவே வெடிப்பு அட்டவணையைச் சீராக்கினால் பற்றாக்குறையை "
            "பெரும்பாலும் ஈடுசெய்யலாம்.",
            "வெடிப்புகளுக்கு இடையிலான நீண்ட காத்திருப்பே {target} டன் என்ற வார "
            "இலக்கிற்கும் உற்பத்திக்கும் உள்ள இடைவெளியை உருவாக்குகிறது, எனவே "
            "வெடிக்கும் நேரத்தை இறுக்குவது முன்னுரிமை.",
            "இந்த வாரத்தின் {target} டன் இலக்கை வெடிப்பு வரிசையே முக்கியமாகப் "
            "பின்தள்ளுகிறது, எனவே நேரத்தைச் சரியாக நிர்வகித்தால் அதிக பயன் "
            "கிடைக்கும்.",
        ],
        "richness": [
            "நல்ல சூழலிலும் இந்தத் தாது இருப்பு வாரத்திற்கு {target} டன் தர முடியாத "
            "அளவே உள்ளது; இப்பகுதியின் தாதுச் செறிவு மிதமானது, எனவே இலக்கை "
            "செழுமையான பகுதிகளை நோக்கி மாற்றுவது நல்லது.",
            "இயந்திரம், வானிலை, வெடிப்பு அனைத்தும் சரியாக இருந்தாலும் இங்குள்ள "
            "தாது இருப்பு வாரத்திற்கு {target} டன் தாங்காது, எனவே பற்றாக்குறை "
            "உண்மையில் செழுமையான பகுதிகளைச் சார்ந்துள்ளது.",
            "{target} டன் இடைவெளிக்குக் காரணம் செயல்பாடுகள் அல்ல, குறைந்த "
            "தாதுச் செறிவே, எனவே அதிக வாய்ப்புள்ள பகுதிகளில் முயற்சியை "
            "மையப்படுத்துவது நல்லது.",
        ],
        "combined": [
            "இயந்திர செயலிழப்பு, மழை, வெடிப்புத் தாமதம் ஆகியவை ஒரே நேரத்தில் "
            "சேர்ந்ததால்தான் {target} டன் வார இலக்கை எட்ட முடியவில்லை, எனவே "
            "அட்டவணையையும் உபகரண ஒதுக்கீட்டையும் ஒன்றாகச் சரிசெய்ய வேண்டும்.",
            "{target} டன் என்ற வார இலக்கிற்கும் உற்பத்திக்கும் உள்ள இடைவெளிக்கு "
            "ஒரே காரணம் இல்லை - இயந்திரம், வானிலை, வெடிப்பு அனைத்தும் ஒரே "
            "திசையில் இழுக்கின்றன, எனவே ஒருங்கிணைந்த தீர்வு தேவை.",
            "பல அழுத்தங்கள் சேர்ந்து உற்பத்தியை {target} டன் வார இலக்கிற்குக் "
            "கீழே வைத்துள்ளன, எனவே அட்டவணையையும் இயந்திரங்களையும் ஒரே "
            "முயற்சியாகக் கையாளுவது நல்லது.",
        ],
        "ontrack": [
            "இயந்திரம், வானிலை, வெடிப்பு அனைத்தும் இயல்பான நிலையில் இருப்பதால், "
            "{target} டன் வார இலக்கு எட்டப்படும் நிலையில் உள்ளது; இப்போது எந்த "
            "நடவடிக்கையும் தேவையில்லை.",
            "சுரங்கம் {target} டன் வார இலக்கை வசதியாக எட்டுகிறது, எனவே இப்போது "
            "எதையும் மாற்ற வேண்டியதில்லை.",
            "உற்பத்தி {target} டன் வார இலக்கு அளவில் அல்லது அதற்கு மேல் உள்ளது, "
            "எனவே இந்த வாரம் எந்தத் தலையீடும் தேவையில்லை.",
        ],
    },
    "hi": {
        "downtime": [
            "मशीनें आम दिनों से ज़्यादा बंद रही हैं, इसीलिए साप्ताहिक {target} टन का "
            "लक्ष्य हासिल नहीं हो पा रहा; इसलिए मशीनों की सर्विसिंग कराना और कम "
            "प्राथमिकता वाले क्षेत्रों से अतिरिक्त उपकरण भेजना सबसे तेज़ उपाय है।",
            "{target} टन के साप्ताहिक लक्ष्य और मौजूदा उत्पादन के बीच ज़्यादातर अंतर "
            "मशीनों के बंद रहने से है, इसलिए मरम्मत को प्राथमिकता देने और उपकरण "
            "दोबारा बाँटने से कमी पूरी हो सकती है।",
            "मशीनों की उपलब्धता ही साप्ताहिक {target} टन का लक्ष्य रोक रही है, "
            "इसलिए रखरखाव अभियान और कुछ मशीनरी का पुनर्आवंटन ज़्यादातर अंतर पाट "
            "देगा।",
        ],
        "rainfall": [
            "इस सप्ताह भारी बारिश ही {target} टन के लक्ष्य तक पहुँचने में मुख्य "
            "अड़चन है, इसलिए बाहरी काम रोककर ब्लास्टिंग को सूखे दिनों में शिफ़्ट "
            "करना व्यावहारिक हल है।",
            "बारिश ही {target} टन के साप्ताहिक लक्ष्य को सबसे ज़्यादा नुकसान पहुँचा "
            "रही है, इसलिए ब्लास्टिंग और बाहरी काम सूखे दिनों के लिए टाल देना बेहतर "
            "होगा।",
            "बारिश के कारण उत्पादन {target} टन के लक्ष्य से नीचे है, इसलिए "
            "ब्लास्टिंग को साफ़ मौसम में शिफ़्ट करना सबसे ज़्यादा मदद करेगा।",
        ],
        "delay": [
            "ब्लास्टिंग में देरी ही साप्ताहिक {target} टन का लक्ष्य चूकने की मुख्य "
            "वजह है, इसलिए ब्लास्ट शेड्यूल सुधारने से ज़्यादातर कमी पूरी हो सकती है।",
            "ब्लास्ट के बीच लंबा इंतज़ार ही {target} टन के साप्ताहिक लक्ष्य और "
            "उत्पादन के बीच अंतर बना रहा है, इसलिए विस्फोट का समय कसना प्राथमिकता "
            "है।",
            "इस सप्ताह का {target} टन लक्ष्य मुख्य रूप से ब्लास्टिंग क्रम से पीछे "
            "खिंच रहा है, इसलिए समय बेहतर तरीके से नियंत्रित करने से सबसे ज़्यादा "
            "फ़ायदा होगा।",
        ],
        "richness": [
            "अच्छी स्थितियों में भी यह अयस्क भंडार साप्ताहिक {target} टन नहीं दे "
            "सकता; इस क्षेत्र की अयस्क समृद्धि सीमित है, इसलिए लक्ष्य को समृद्ध "
            "ब्लॉकों की ओर संतुलित करना चाहिए।",
            "उपकरण, मौसम और ब्लास्टिंग ठीक होने पर भी यहाँ का भंडार साप्ताहिक "
            "{target} टन सँभाल नहीं सकता, इसलिए कमी असल में समृद्ध क्षेत्रों पर "
            "निर्भरता की है।",
            "{target} टन के अंतर की वजह परिचालन नहीं बल्कि सीमित अयस्क समृद्धि है, "
            "इसलिए अधिक संभावनाशील पिट पर ध्यान केंद्रित करना बेहतर होगा।",
        ],
        "combined": [
            "उपकरण बंद रहना, बारिश और ब्लास्टिंग में देरी - तीनों एक साथ पड़ने से "
            "साप्ताहिक {target} टन का लक्ष्य हासिल नहीं हो पा रहा, इसलिए शेड्यूल और "
            "उपकरण आवंटन दोनों को साथ में ठीक करना ज़रूरी है।",
            "{target} टन के साप्ताहिक लक्ष्य और उत्पादन के अंतर की एक वजह नहीं है - "
            "उपकरण, मौसम और ब्लास्टिंग सब एक ही दिशा में खींच रहे हैं, इसलिए "
            "समन्वित हल चाहिए।",
            "कई दबाव मिलकर उत्पादन को {target} टन के साप्ताहिक लक्ष्य से नीचे रख "
            "रहे हैं, इसलिए शेड्यूल और मशीनरी को एक ही प्रयास में संभालना उचित है।",
        ],
        "ontrack": [
            "उपकरण, मौसम और ब्लास्टिंग सब सामान्य हैं, इसलिए साप्ताहिक {target} टन "
            "का लक्ष्य हासिल होने की स्थिति में है; अभी किसी कार्रवाई की ज़रूरत नहीं "
            "है।",
            "खदान साप्ताहिक {target} टन का लक्ष्य आराम से पूरा कर रही है, इसलिए अभी "
            "कुछ बदलने की ज़रूरत नहीं है।",
            "उत्पादन साप्ताहिक {target} टन के लक्ष्य पर या उससे ऊपर बना हुआ है, "
            "इसलिए इस सप्ताह कोई हस्तक्षेप ज़रूरी नहीं।",
        ],
    },
}

TARGET_SCENARIOS = ("downtime", "rainfall", "delay", "richness", "combined",
                    "ontrack")


# --- Blast-delay-dominant wording -------------------------------------------
# When blast delay is the dominant factor, the generic "smooth the blast
# schedule" line is replaced with a specific suggestion that quotes typical
# blasting parameters (blast count, hole depth, yield per blast) averaged from
# manganese_historical_data.xlsx. The caller supplies those averages, so this
# module stays free of file I/O and just formats them.
#
# {where} adapts the same sentence to a single cell ("in this zone") or to the
# whole mine ("across the mine") so the weekly target explanation still reads
# naturally.
BLAST_DELAY_WHERE = {
    "en": {"pit": "in this zone", "mine": "across the mine"},
    "ta": {"pit": "இந்தப் பகுதியில்", "mine": "சுரங்கம் முழுவதும்"},
    "hi": {"pit": "इस क्षेत्र में", "mine": "पूरी खदान में"},
}

BLAST_DELAY_TEMPLATES = {
    "en": [
        "Blast delays (currently {delay} hrs) are reducing yield. Typical "
        "operations average {count} blasts with {depth}m hole depth yielding "
        "{yield_tonnes} tonnes per blast - consolidating blasts or increasing "
        "hole depth efficiency {where} could help recover lost tonnage from "
        "delays.",
        "The current {delay}-hour blast delay is what is holding yield back. "
        "Typical operations average about {count} blasts at {depth}m hole depth "
        "for roughly {yield_tonnes} tonnes per blast, so consolidating blasts or "
        "improving hole-depth efficiency {where} would help win back the tonnage "
        "lost to delays.",
    ],
    "ta": [
        "வெடிப்பு தாமதங்கள் (தற்போது {delay} மணிநேரம்) மகசூலைக் குறைக்கின்றன. "
        "வழக்கமான செயல்பாடுகளில் சராசரியாக {count} வெடிப்புகள், {depth}மீ துளை "
        "ஆழம், ஒரு வெடிப்புக்கு {yield_tonnes} டன் விளைச்சல் இருக்கும் - எனவே "
        "வெடிப்புகளை ஒருங்கிணைப்பதும், துளை ஆழத் திறனை உயர்த்துவதும் {where} "
        "தாமதத்தால் இழந்த டன்னை மீட்டெடுக்க உதவும்.",
        "தற்போதைய {delay} மணிநேர வெடிப்புத் தாமதமே மகசூலைப் பின்தள்ளுகிறது. "
        "வழக்கமாக {count} வெடிப்புகள், {depth}மீ துளை ஆழம், ஒரு வெடிப்புக்கு "
        "சுமார் {yield_tonnes} டன் விளைச்சல் கிடைக்கும் என்பதால், {where} "
        "வெடிப்புகளை ஒருங்கிணைத்து துளை ஆழச் செயல்திறனை மேம்படுத்தினால் இழந்த "
        "டன்னை மீட்கலாம்.",
    ],
    "hi": [
        "ब्लास्टिंग में देरी (अभी {delay} घंटे) उत्पादन घटा रही है। सामान्य "
        "परिचालन में औसतन {count} ब्लास्ट, {depth}मी होल डेप्थ और प्रति ब्लास्ट "
        "{yield_tonnes} टन उपज होती है - इसलिए ब्लास्ट को एक साथ करना या होल डेप्थ "
        "दक्षता बढ़ाना {where} देरी से हुई टन हानि वापस पाने में मदद करेगा।",
        "मौजूदा {delay} घंटे की ब्लास्ट देरी ही उत्पादन को पीछे खींच रही है। "
        "सामान्य परिचालन में करीब {count} ब्लास्ट, {depth}मी होल डेप्थ पर लगभग "
        "{yield_tonnes} टन प्रति ब्लास्ट उपज मिलती है, इसलिए {where} ब्लास्ट एक साथ "
        "करने और होल डेप्थ दक्षता सुधारने से खोई टन वापस पाई जा सकती है।",
    ],
}


def blast_delay_message(language, delay_hours, stats, scope="pit", rng=None):
    """A specific blast-delay suggestion quoting typical blasting parameters.

    `stats` is the dict of column averages (Blast_Count, Average_Hole_Depth_m,
    Blast_Yield_tonnes). Returns None when those averages are unavailable, so the
    caller can fall back to the generic delay wording.
    """
    if not stats:
        return None
    lang = normalize_language(language)
    template = (rng or random).choice(BLAST_DELAY_TEMPLATES[lang])
    return template.format(
        delay=f"{float(delay_hours):.0f}",
        count=f"{float(stats['Blast_Count']):.0f}",
        depth=f"{float(stats['Average_Hole_Depth_m']):.1f}",
        yield_tonnes=f"{float(stats['Blast_Yield_tonnes']):,.0f}",
        where=BLAST_DELAY_WHERE[lang][scope],
    )


def normalize_language(value):
    """Map a requested language onto a supported code, defaulting to English."""
    if isinstance(value, str):
        code = value.strip().lower()
        if code in SUPPORTED_LANGUAGES:
            return code
    return DEFAULT_LANGUAGE


def pick_reason(language, scenario, rng=None, blast_stats=None,
                delay_hours=None):
    """Return one natural sentence for the scenario, in the given language.

    A phrasing is chosen at random so repeated pits do not read identically.
    Unknown scenarios fall back to the neutral 'low' wording.

    When blast delay is a factor (delay_hours supplied), the 'delay' scenario
    uses the specific blast-parameter wording and the 'combined' scenario is
    followed by it, provided the reference averages in `blast_stats` are
    available.
    """
    lang = normalize_language(language)
    if scenario == "delay" and delay_hours is not None:
        message = blast_delay_message(lang, delay_hours, blast_stats, "pit", rng)
        if message:
            return message
    options = TEMPLATES[lang].get(scenario) or TEMPLATES[lang]["low"]
    sentence = (rng or random).choice(options)
    if scenario == "combined" and delay_hours is not None:
        message = blast_delay_message(lang, delay_hours, blast_stats, "pit", rng)
        if message:
            sentence = f"{sentence} {message}"
    return sentence


def pick_target_reason(language, scenario, target_tonnes, rng=None,
                       blast_stats=None, delay_hours=None):
    """Return one natural sentence about a weekly shortfall against a target.

    Same scenario keys and randomised-phrasing behaviour as pick_reason, but the
    wording is about the whole mine and interpolates the target in tonnes. When
    blast delay is a factor, the specific blast-parameter wording is used (or
    appended to the 'combined' wording), scoped to the whole mine.
    """
    lang = normalize_language(language)
    if scenario == "delay" and delay_hours is not None:
        message = blast_delay_message(lang, delay_hours, blast_stats, "mine", rng)
        if message:
            return message
    options = TARGET_TEMPLATES[lang].get(scenario) or TARGET_TEMPLATES[lang]["ontrack"]
    template = (rng or random).choice(options)
    sentence = template.format(target=f"{float(target_tonnes):,.0f}")
    if scenario == "combined" and delay_hours is not None:
        message = blast_delay_message(lang, delay_hours, blast_stats, "mine", rng)
        if message:
            sentence = f"{sentence} {message}"
    return sentence
