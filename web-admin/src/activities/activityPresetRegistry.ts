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

export const BUZZER_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'buzzerBattle',
    label: 'Buzzer Battle',
    description: 'Race to answer first as the host reveals a clue ladder.',
    config: {
      preset: 'buzzerBattle',
      presetLabel: 'BUZZER BATTLE',
      title: 'Buzzer Battle',
      clues: [{ id: 'clue-1', prompt: 'This warm-up answer is something bright in the night sky.', answer: 'The moon', points: 100 }, { id: 'clue-2', prompt: 'It can be full, new, or crescent.', answer: 'The moon', points: 75 }],
      lockOutOnMiss: true,
      wrongPenalty: 0
    }
  },
  {
    id: 'clueLadder',
    label: 'Clue Ladder',
    description: 'Make earlier clues worth more and reward confident buzzes.',
    config: {
      preset: 'clueLadder',
      presetLabel: 'CLUE LADDER',
      title: 'Clue Ladder',
      clues: [{ id: 'clue-1', prompt: 'This answer can be found in many kitchens.', answer: 'A refrigerator', points: 300 }, { id: 'clue-2', prompt: 'It keeps food cold.', answer: 'A refrigerator', points: 200 }, { id: 'clue-3', prompt: 'It often has a freezer on top or below.', answer: 'A refrigerator', points: 100 }],
      lockOutOnMiss: true,
      wrongPenalty: 0
    }
  },
  {
    id: 'mysteryPerson',
    label: 'Mystery Person',
    description: 'Reveal biographical clues about a person chosen by the teacher.',
    config: {
      preset: 'mysteryPerson',
      presetLabel: 'MYSTERY PERSON',
      title: 'Mystery Person',
      clues: [{ id: 'clue-1', prompt: 'This person is connected to today’s lesson.', answer: 'Add a person', points: 300 }, { id: 'clue-2', prompt: 'A detail about their work or life is…', answer: 'Add a person', points: 200 }, { id: 'clue-3', prompt: 'The final clue makes the answer clear.', answer: 'Add a person', points: 100 }]
    }
  },
  {
    id: 'mysteryPlace',
    label: 'Mystery Place',
    description: 'Use location clues for geography, history, or a room-based warm-up.',
    config: {
      preset: 'mysteryPlace',
      presetLabel: 'MYSTERY PLACE',
      title: 'Mystery Place',
      clues: [{ id: 'clue-1', prompt: 'This place is connected to the story or lesson.', answer: 'Add a place', points: 300 }, { id: 'clue-2', prompt: 'One landmark, region, or historical detail is…', answer: 'Add a place', points: 200 }, { id: 'clue-3', prompt: 'The final clue reveals the location.', answer: 'Add a place', points: 100 }]
    }
  },
  {
    id: 'mysteryObject',
    label: 'Mystery Object',
    description: 'Identify an object from broad-to-specific clues.',
    config: {
      preset: 'mysteryObject',
      presetLabel: 'MYSTERY OBJECT',
      title: 'Mystery Object',
      clues: [{ id: 'clue-1', prompt: 'You might find this near a desk or table.', answer: 'Add an object', points: 300 }, { id: 'clue-2', prompt: 'It is useful for a specific task.', answer: 'Add an object', points: 200 }, { id: 'clue-3', prompt: 'The final clue gives away its shape or name.', answer: 'Add an object', points: 100 }]
    }
  },
  {
    id: 'commonThread',
    label: 'Common Thread',
    description: 'Reveal examples until teams identify what connects them.',
    config: {
      preset: 'commonThread',
      presetLabel: 'COMMON THREAD',
      title: 'Common Thread',
      clues: [{ id: 'clue-1', prompt: 'Example one belongs in the hidden category.', answer: 'Add the common thread', points: 300 }, { id: 'clue-2', prompt: 'Example two narrows the category.', answer: 'Add the common thread', points: 200 }, { id: 'clue-3', prompt: 'The final example makes the connection clear.', answer: 'Add the common thread', points: 100 }]
    }
  },
  {
    id: 'password',
    label: 'Password',
    description: 'Use short one-word-style clues to get a teammate to say the answer.',
    config: {
      preset: 'password',
      presetLabel: 'PASSWORD',
      title: 'Password',
      clues: [{ id: 'clue-1', prompt: 'A one-word clue for your teammate.', answer: 'Add the password', points: 200 }, { id: 'clue-2', prompt: 'A second clue, no repeats.', answer: 'Add the password', points: 100 }]
    }
  }
];

export const PUNCHLINE_PRESETS: ActivityPresetTemplate[] = [
  { id: 'punchline', label: 'Punchline', description: 'Finish a prompt with the funniest answer you can.', config: { preset: 'punchline', presetLabel: 'PUNCHLINE', title: 'Punchline', prompts: [{ id: 'prompt-1', prompt: 'The worst possible school mascot would be ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'captionThis', label: 'Caption This', description: 'Write a caption for a teacher-selected image or scene.', config: { preset: 'captionThis', presetLabel: 'CAPTION THIS', title: 'Caption This', prompts: [{ id: 'prompt-1', prompt: 'Write the caption this picture deserves.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'autocomplete', label: 'Autocomplete', description: 'Complete a sentence in the most surprising way.', config: { preset: 'autocomplete', presetLabel: 'AUTOCOMPLETE', title: 'Autocomplete', prompts: [{ id: 'prompt-1', prompt: 'I knew it was going to be a long day when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'badAdvice', label: 'Bad Advice', description: 'Give the least helpful answer to a very real problem.', config: { preset: 'badAdvice', presetLabel: 'BAD ADVICE', title: 'Bad Advice', prompts: [{ id: 'prompt-1', prompt: 'What is the worst advice for someone who forgot their homework?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'wrongAnswersOnly', label: 'Wrong Answers Only', description: 'Answer a simple prompt with a confidently incorrect response.', config: { preset: 'wrongAnswersOnly', presetLabel: 'WRONG ANSWERS ONLY', title: 'Wrong Answers Only', prompts: [{ id: 'prompt-1', prompt: 'What is this object definitely used for?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'sloganFactory', label: 'Slogan Factory', description: 'Invent a slogan for a team, idea, or imaginary product.', config: { preset: 'sloganFactory', presetLabel: 'SLOGAN FACTORY', title: 'Slogan Factory', prompts: [{ id: 'prompt-1', prompt: 'Create a slogan for a school that has one unusual rule.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'moviePitch', label: 'Movie Pitch', description: 'Pitch a movie from a short teacher-authored setup.', config: { preset: 'moviePitch', presetLabel: 'MOVIE PITCH', title: 'Movie Pitch', prompts: [{ id: 'prompt-1', prompt: 'Pitch a movie about a team that cannot agree on a name.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'makeItWorse', label: 'Make It Worse', description: 'Take an ordinary situation and escalate it creatively.', config: { preset: 'makeItWorse', presetLabel: 'MAKE IT WORSE', title: 'Make It Worse', prompts: [{ id: 'prompt-1', prompt: 'A normal group project becomes much worse when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } }
];

export const FAKE_OUT_PRESETS: ActivityPresetTemplate[] = [
  { id: 'fakeOut', label: 'Fake Out', description: 'Find the real answer among believable bluffs.', config: { preset: 'fakeOut', presetLabel: 'FAKE OUT', title: 'Fake Out', rounds: [{ id: 'round-1', prompt: 'Which of these facts is true? Write a believable fake answer.', truth: 'Honey never spoils.', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whoWroteThat', label: 'Who Wrote That?', description: 'Guess which answer belongs to the teacher or target author.', config: { preset: 'whoWroteThat', presetLabel: 'WHO WROTE THAT?', title: 'Who Wrote That?', rounds: [{ id: 'round-1', prompt: 'Which answer was written by the mystery author?', truth: 'Add the real answer', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'confessions', label: 'Confessions', description: 'Separate the real confession from the invented stories.', config: { preset: 'confessions', presetLabel: 'CONFESSIONS', title: 'Confessions', rounds: [{ id: 'round-1', prompt: 'Which confession is real?', truth: 'Add the real confession', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'secretTalent', label: 'Secret Talent', description: 'Find the real talent hidden among decoys.', config: { preset: 'secretTalent', presetLabel: 'SECRET TALENT', title: 'Secret Talent', rounds: [{ id: 'round-1', prompt: 'Which secret talent belongs to the target player?', truth: 'Add the real talent', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whyIsThisHere', label: 'Why Is This Here?', description: 'Guess the true reason an object, image, or detail appears.', config: { preset: 'whyIsThisHere', presetLabel: 'WHY IS THIS HERE?', title: 'Why Is This Here?', rounds: [{ id: 'round-1', prompt: 'Why is this object in the scene?', truth: 'Add the real reason', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } }
];
