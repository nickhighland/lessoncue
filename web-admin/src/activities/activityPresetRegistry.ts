export interface ActivityPresetTemplate {
  id: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
}

export const QUIZ_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'trivia',
    label: 'Trivia',
    description: 'Teacher-authored questions with any number of choices from 2–8.',
    config: {
      preset: 'trivia',
      presetLabel: 'TRIVIA',
      title: 'Trivia',
      questions: [{ id: 'question-1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, explanation: 'Mars appears red because of iron oxide on its surface.' }]
    }
  },
  {
    id: 'factOrFiction',
    label: 'Fact or Fiction',
    description: 'A quick binary knowledge check with a clear reveal.',
    config: {
      preset: 'factOrFiction',
      presetLabel: 'FACT OR FICTION',
      title: 'Fact or Fiction',
      questions: [{ id: 'question-1', prompt: 'A day on Venus is longer than a year on Venus.', options: ['Fact', 'Fiction'], correctIndex: 0, explanation: 'Venus rotates so slowly that one rotation takes longer than one trip around the Sun.' }]
    }
  },
  {
    id: 'twoTruthsAndALie',
    label: 'Two Truths & a Lie',
    description: 'Choose the one statement that does not belong.',
    config: {
      preset: 'twoTruthsAndALie',
      presetLabel: 'TWO TRUTHS & A LIE',
      title: 'Two Truths & a Lie',
      questions: [{ id: 'question-1', prompt: 'Which statement is the lie about a school day?', options: ['A class can have a bell.', 'A pencil can roll.', 'The sun rises in the west.'], correctIndex: 2, explanation: 'The sun rises in the east.' }]
    }
  },
  {
    id: 'spotTheFake',
    label: 'Spot the Fake',
    description: 'Find the invented option hidden among believable answers.',
    config: {
      preset: 'spotTheFake',
      presetLabel: 'SPOT THE FAKE',
      title: 'Spot the Fake',
      questions: [{ id: 'question-1', prompt: 'Which item does not belong in a basic emergency kit?', options: ['Water', 'Flashlight', 'A cloud', 'Bandages'], correctIndex: 2, explanation: 'A cloud is not a basic emergency-kit item.' }]
    }
  },
  {
    id: 'finishTheQuote',
    label: 'Finish the Quote',
    description: 'Complete a familiar phrase or replace it with your own lesson text.',
    config: {
      preset: 'finishTheQuote',
      presetLabel: 'FINISH THE QUOTE',
      title: 'Finish the Quote',
      questions: [{ id: 'question-1', prompt: 'Finish this phrase: Better late than ____.', options: ['never', 'always', 'maybe'], correctIndex: 0 }]
    }
  },
  {
    id: 'fillTheBlank',
    label: 'Fill the Blank',
    description: 'Turn a lesson sentence or key term into a structured recall question.',
    config: {
      preset: 'fillTheBlank',
      presetLabel: 'FILL THE BLANK',
      title: 'Fill the Blank',
      questions: [{ id: 'question-1', prompt: 'A triangle has ____ sides.', options: ['2', '3', '4'], correctIndex: 1 }]
    }
  },
  {
    id: 'higherOrLower',
    label: 'Higher or Lower',
    description: 'Ask the room to classify a value, fact, or result relative to a reference.',
    config: {
      preset: 'higherOrLower',
      presetLabel: 'HIGHER OR LOWER',
      title: 'Higher or Lower',
      questions: [{ id: 'question-1', prompt: 'Is the answer higher or lower than 50?', options: ['Higher', 'Lower', 'Exactly 50'], correctIndex: 0 }]
    }
  },
  {
    id: 'guessTheNumber',
    label: 'Guess the Number',
    description: 'Use ranges as a friendly number-estimation warm-up.',
    config: {
      preset: 'guessTheNumber',
      presetLabel: 'GUESS THE NUMBER',
      title: 'Guess the Number',
      questions: [{ id: 'question-1', prompt: 'Which range contains the mystery number?', options: ['Under 10', '10–20', 'Over 20'], correctIndex: 1 }]
    }
  },
  {
    id: 'isItAHorse',
    label: 'Is It a Horse?',
    description: 'A playful, generic yes/no classification game; replace the prompt with any category.',
    config: {
      preset: 'isItAHorse',
      presetLabel: 'IS IT A HORSE?',
      title: 'Is It a Horse?',
      questions: [{ id: 'question-1', prompt: 'Is this example in the target category?', options: ['Yes', 'No'], correctIndex: 0, explanation: 'Replace this generic example with your own classification prompt.' }]
    }
  }
];

export const POLL_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'readTheRoom',
    label: 'Read the Room',
    description: 'Reveal the distribution and see where the group lands.',
    config: { preset: 'readTheRoom', presetLabel: 'READ THE ROOM', question: 'Which choice best matches the room?', options: ['Option A', 'Option B', 'Option C'] }
  },
  {
    id: 'majorityRules',
    label: 'Majority Rules',
    description: 'Let the largest group answer the question for the room.',
    config: { preset: 'majorityRules', presetLabel: 'MAJORITY RULES', question: 'Which option do you think most people will choose?', options: ['Option A', 'Option B', 'Option C'] }
  },
  {
    id: 'minorityReport',
    label: 'Minority Report',
    description: 'Invite the room to predict the least popular answer.',
    config: { preset: 'minorityReport', presetLabel: 'MINORITY REPORT', question: 'Which option will the fewest people choose?', options: ['Option A', 'Option B', 'Option C'] }
  },
  {
    id: 'splitDecision',
    label: 'Split Decision',
    description: 'Create a clean either/or choice and show the split.',
    config: { preset: 'splitDecision', presetLabel: 'SPLIT DECISION', question: 'Which side are you on?', options: ['Side A', 'Side B'] }
  },
  {
    id: 'wouldYouRather',
    label: 'Would You Rather',
    description: 'Use two strong choices to spark a quick, playful debate.',
    config: { preset: 'wouldYouRather', presetLabel: 'WOULD YOU RATHER', question: 'Would you rather be 30 minutes early or 5 minutes late?', options: ['30 minutes early', '5 minutes late'] }
  },
  {
    id: 'hotTake',
    label: 'Hot Take',
    description: 'Turn a discussion prompt into a fast agree/disagree meter.',
    config: { preset: 'hotTake', presetLabel: 'HOT TAKE', question: 'A little disagreement makes a group more creative.', options: ['Agree', 'Not sure', 'Disagree'] }
  },
  {
    id: 'mostLikelyTo',
    label: 'Most Likely To',
    description: 'Use participant or team names as the choices.',
    config: { preset: 'mostLikelyTo', presetLabel: 'MOST LIKELY TO', question: 'Who is most likely to bring snacks for everyone?', options: ['Name 1', 'Name 2', 'Name 3'] }
  },
  {
    id: 'unpopularOpinion',
    label: 'Unpopular Opinion',
    description: 'Give the room a safe way to take a strong position.',
    config: { preset: 'unpopularOpinion', presetLabel: 'UNPOPULAR OPINION', question: 'Which everyday thing is overrated?', options: ['Option A', 'Option B', 'Option C', 'Option D'] }
  },
  {
    id: 'worstChoicePossible',
    label: 'Worst Choice Possible',
    description: 'Ask the group to identify the most delightfully terrible option.',
    config: { preset: 'worstChoicePossible', presetLabel: 'WORST CHOICE POSSIBLE', question: 'Which is the worst choice for a team mascot?', options: ['A sleepy turtle', 'A confused pigeon', 'A very loud alarm clock'] }
  }
];
