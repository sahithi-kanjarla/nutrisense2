# NutriSense

A full-stack digital pantry and nutrition app: pantry with expiry tracking, meal logging with automatic macros, an AI diet balancer that suggests foods you already own, an allergy-aware AI assistant, recipes, a weekly planner with grocery list, and progress tracking.

Zero npm dependencies. It needs **Node 22.13 or newer** (uses the built-in `node:sqlite`).

## Setup

```bash
cp .env.example .env      # then edit .env
npm start                 # http://localhost:4000
```

Put your keys in `.env`:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | Google AI Studio key (free tier). Primary AI. |
| `GROQ_API_KEY` | Groq key. Used for light tasks and as a fallback. |
| `JWT_SECRET` | Optional. A random secret is generated and saved if empty. |
| `PORT`, `DATABASE_PATH` | Optional. Defaults: 4000 and `./server/data/nutrisense.db`. |

The app works without keys: sign-up, pantry, meal logging (built-in food table of ~110 foods), the pantry-based balancer and the planner all run offline. Chat, recipes, photo analysis and AI planning need a key and show a clear "add your key" message otherwise.

## How the AI is routed

- **Gemini** (`gemini-2.5-flash`): chat, recipes, weekly plans, balancer wording, photo analysis, weekly review.
- **Groq** (`llama-3.3-70b-versatile`): quick tasks (meal text analysis, nutrition estimates for new pantry items), saving Gemini's free quota.
- Each falls back to the other on errors or rate limits (with a short cooldown).

Safety is enforced in code, not only in prompts: AI recipes (title, ingredients, steps), weekly plans, chat replies, balancer suggestions and review text are checked against the user's allergies and diet. Unsafe recipes are retried once, then dropped, and unsafe prose is replaced with a safe message. The checks understand plurals and common Indian food names, but they are keyword based, so treat them as a strong safety net rather than a guarantee. Calorie targets use Mifflin-St Jeor with floors, no deficit for under-18s, low BMI or pregnancy.

## How nutrition is calculated

- **Daily targets** use the Mifflin-St Jeor equation with safety floors. No AI is involved.
- **Foods in the built-in table** are calculated exactly: `amount in grams x values per 100 g`. Portion words are converted with food-specific weights (a teaspoon of ghee is 4.5 g, of sugar 4.2 g, a katori of dal about 150 g, a roti 40 g). Oil is stored per 100 ml (it weighs 0.92 g/ml).
- **Cooked dishes** such as roti, dal, idli, dosa, poha, upma, khichdi and pulao are *calculated from ingredient quantities* (for example one 40 g roti = 30 g atta + 1.5 g ghee), not typed in as one number.
- **Cooking notes** change the result: an explicit amount ("1 tsp ghee"), a level ("very little oil", "deep fried", "no oil") and a flour blend ("oats flour and wheat flour", "70% wheat 30% oats"). When proportions are not given, equal parts are assumed and the result says so. Other details in a note (spices, gravy base) are kept as text and do not change the calories; the result says that too.
- **The AI names the foods; the app does the arithmetic.** When the AI recognises a food in the table and gives an amount, the numbers are recalculated from the table or recipe (including your cooking note and any flours in the food name), and the AI's own figure is kept for comparison. A weight in the text, such as "(150 g)", wins over wording like "1 bowl".
- **Foods the table does not know** are estimated by the AI. Its numbers are checked: calories above 9 kcal per gram are impossible and are lowered, nutrients that outweigh the food are scaled down, and an estimate far from the built-in table is flagged "Check" with the table's figure.
- **Data sources.** Each table entry has a source: `usda-checked` (compared with USDA FoodData Central and within a few percent: rice, cooked rice, atta, oats, maida, besan, toor, moong and masoor dal), `calculated` (cooked dishes built from ingredients), or `reference` (typical IFCT or USDA values entered by hand, not individually verified). Treat everything as an estimate: real portions, brands and recipes vary by 10 to 25 percent.

## Meal logging and review

Describe a meal, attach a photo, or do both. NutriSense lists the foods it found, and nothing is saved until you press **Log**.

- Every food row is editable (name, amount, ingredients and cooking), and you can remove wrong detections or add missing foods. Edited rows must be recalculated before logging.
- Badges show where each row came from: **You said**, **Seen in photo**, or **Assumed** (an AI guess). A photo cannot show hidden ingredients, oil, ghee or exact weights, so those are always labelled as assumptions.
- The AI may ask up to three quick follow-up questions (for example how much oil was used). You can skip them.
- Photos are analysed once and are not stored. Photo analysis needs a Gemini key.
- Manual entry is unchanged.

## Demo

On the login page, **Try the demo** creates a temporary guest account with sample meals, pantry and weight history (removed after 3 days). Please do not enter real health details in a public demo.

## Deploying

Set `GEMINI_API_KEY`, `GROQ_API_KEY` and `JWT_SECRET` as environment variables on the host (not the `.env` file). Use Node 22.13 or newer. The server listens on localhost by default; set `HOST=0.0.0.0` to accept outside connections. Use a host with a persistent disk for the SQLite database.

## Commands

```bash
npm start     # run the server
npm run dev   # run with auto-restart
npm test      # unit and API tests (mock AI servers, in-memory DB)
```

## Notes and limits

- Profile and pantry details are sent to Gemini/Groq when you use an AI feature.
- No micronutrient (vitamin/mineral) tracking and no barcode scanning yet. Progress shows only what is actually tracked.
- The units and reminder settings are saved, but display is metric/kcal and reminders are not delivered (no notification service).
- General nutrition guidance, not medical advice.
