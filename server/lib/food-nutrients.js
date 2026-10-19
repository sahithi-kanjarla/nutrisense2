/**
 * Sodium, saturated fat and added sugar for the built-in foods, per 100 g (per 100 ml for liquids).
 * Each entry is [sodium_mg, sat_fat_g, added_sugar_g]. `null` means "no reliable figure": it is NOT zero.
 *
 * Where the numbers come from (all are typical published figures entered by hand, source "reference"):
 *  - Raw staples, vegetables, fruit, nuts: USDA FoodData Central / IFCT 2017 typical values.
 *  - Prepared dishes: calculated from ingredients for the recipes in foods.js; typical home-cooked
 *    values (about 0.8% salt by weight) for the other dishes.
 *  - Packaged foods: typical Indian market labels. They vary by brand, so treat them as rough.
 *
 * Rules that keep the numbers honest:
 *  - Plain foods are listed WITHOUT added salt (rice 1 mg, not "salted rice"). Salt added at the table
 *    or in dishes that are not listed here is not counted, so daily sodium is a floor, not a ceiling.
 *  - "Added sugar" means free sugars (WHO): table sugar, jaggery, honey, syrups, and sugars in juices.
 *    Sugar naturally inside whole fruit, vegetables and milk is not counted.
 *  - A food with a value of 0 really has none. A food with null has not been measured.
 *  - Saturated fat never exceeds total fat and added sugar never exceeds total carbohydrate
 *    (the table integrity test enforces this).
 */
export const NUTRIENTS = {
  // Grains and flours
  'rice': [1, 0.2, 0],
  'brown rice': [4, 0.5, 0],
  'cooked rice': [1, 0.1, 0],
  'cooked brown rice': [4, 0.2, 0],
  'atta': [2, 0.3, 0],
  'maida': [2, 0.2, 0],
  'bread': [470, 0.9, 3],
  'rolled oats': [2, 1.2, 0],
  'oats porridge': [40, 0.8, 0],
  'suji': [1, 0.2, 0],
  'poha': [10, 0.3, 0],
  'quinoa': [5, 0.7, 0],
  'cooked quinoa': [7, 0.2, 0],
  'pasta': [6, 0.3, 0],
  'cooked pasta': [1, 0.2, 0],
  'besan': [64, 0.7, 0],
  'besan chilla': [280, 0.9, 0],

  // Lentils and legumes
  'toor dal': [17, 0.4, 0],
  'moong dal': [15, 0.3, 0],
  'masoor dal': [6, 0.3, 0],
  'chana dal': [24, 0.6, 0],
  'urad dal': [38, 0.4, 0],
  'chickpeas': [24, 0.6, 0],
  'roasted chana': [null, 0.6, 0],
  'chole cooked': [300, 0.6, 0],
  'rajma': [24, 0.2, 0],
  'rajma cooked': [280, 0.4, 0],
  'soya chunks': [20, 0.1, 0],
  'tofu': [7, 0.7, 0],

  // Prepared dishes
  'sambar': [300, 0.5, 0],
  'curd rice': [220, 1.5, 0],
  'biryani': [350, 1.5, 0],
  'chicken biryani': [380, 1.8, 0],
  'samosa': [400, 4, 0],
  'salad': [20, 0.1, 0],
  'chai': [25, 1.1, 4.5],

  // Dairy and eggs
  'paneer': [20, 14, 0],
  'palak paneer': [300, 6.5, 0],
  'paneer tikka': [350, 7, 0],
  'milk': [44, 1.9, 0],
  'almond milk': [70, 0.1, 0],
  'oat milk': [45, 0.2, null],
  'coconut milk': [13, 18, 0],
  'soy milk': [45, 0.2, 0],
  'green tea': [2, 0, 0],
  'curd': [46, 2.1, 0],
  'greek yogurt': [36, 0.3, 0],
  'buttermilk': [140, 0.5, 0],
  'ghee': [2, 62, 0],
  'butter': [600, 51, 0],
  'cheese': [620, 17, 0],
  'egg': [130, 3.1, 0],
  'egg white': [166, 0, 0],

  // Vegetables
  'spinach': [79, 0.1, 0],
  'tomato': [5, 0, 0],
  'onion': [4, 0, 0],
  'potato': [6, 0, 0],
  'cauliflower': [30, 0.1, 0],
  'capsicum': [4, 0.1, 0],
  'carrot': [69, 0, 0],
  'cucumber': [2, 0, 0],
  'green peas': [5, 0.1, 0],
  'cabbage': [18, 0, 0],
  'okra': [7, 0, 0],
  'brinjal': [2, 0, 0],
  'garlic': [17, 0.1, 0],
  'ginger': [13, 0.2, 0],
  'coriander': [46, 0, 0],
  'mushroom': [5, 0.1, 0],

  // Fruit
  'banana': [1, 0.1, 0],
  'apple': [1, 0, 0],
  'orange': [0, 0, 0],
  'mango': [1, 0.1, 0],
  'papaya': [8, 0.1, 0],
  'grapes': [2, 0.1, 0],
  'watermelon': [1, 0, 0],

  // Nuts, seeds and dried fruit
  'almonds': [1, 3.8, 0],
  'cashews': [12, 7.8, 0],
  'walnuts': [2, 6.1, 0],
  'peanuts': [18, 6.8, 0],
  'peanut butter': [430, 10, null],
  'chia seeds': [16, 3.3, 0],
  'flax seeds': [30, 3.7, 0],
  'sesame seeds': [11, 7, 0],
  'dates': [1, 0, 0],
  'raisins': [11, 0.1, 0],

  // Animal protein
  'chicken breast': [74, 1, 0],
  'chicken curry': [320, 2.5, 0],
  'fish': [70, 1, 0],
  'prawns': [119, 0.1, 0],

  // Fats, sugars and other. Oil is about 14% saturated; coconut oil has its own, much higher, entry.
  'cooking oil': [0, 13, 0],
  'coconut oil': [0, 78, 0],
  'sugar': [1, 0, 100],
  'jaggery': [30, 0, 98],
  'honey': [4, 0, 82],
  'coconut': [20, 29.7, 0],
  'biscuits': [400, 7, 22],
  'protein powder': [null, null, null], // brands differ too much for a typical value

  // Indian staples, street food and packaged foods
  'rice flour': [1, 0.4, 0],
  'jowar flour': [6, 0.4, 0],
  'bajra flour': [5, 0.9, 0],
  'ragi flour': [11, 0.2, 0],
  'makhana': [null, 0.1, 0],
  'murmura': [7, 0.1, 0],
  'sweet potato': [55, 0, 0],
  'beetroot': [78, 0, 0],
  'pumpkin': [1, 0.1, 0],
  'bottle gourd': [2, 0, 0],
  'coconut water': [105, 0.2, 0],
  'hummus': [380, 1.4, 0],
  'cornflakes': [650, 0.2, 8],
  'muesli': [null, 1.2, null],
  'dhokla': [400, 1, 3],
  'vada pav': [480, 2.5, 2],
  'french fries': [280, 3, 0],
  'pizza': [600, 4.5, 2],
  'rasgulla': [25, 0.6, 35],
  'gulab jamun': [70, 6.5, 45],
  'kheer': [45, 2.5, 9],
  'sweet lassi': [45, 1.4, 8],
  'egg curry': [320, 2.5, 0],
  'mutton curry': [340, 4.5, 0],
  'fish curry': [300, 1.2, 0],
  'chicken tikka': [420, 1.2, 0],
  'peanut chikki': [25, 3.5, 40],
  'namkeen': [900, 10, 1],
  'potato chips': [600, 13, 0],
  'cola': [4, 0, 10.6],
  'fruit juice': [10, 0.1, 11],
  'sugarcane juice': [null, 0, 14]
};

// Sodium in table salt: 39.3% of its weight. Used for salt in recipes and for "1 tsp salt" in cooking notes.
export const SODIUM_MG_PER_G_SALT = 393;
export const SALT_G_PER_TSP = 6;
