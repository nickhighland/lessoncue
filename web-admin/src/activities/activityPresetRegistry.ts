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
  },
  { id: 'whoSaidIt', label: 'Who Said It?', description: 'Choose the speaker or source behind a teacher-authored quote.', config: { preset: 'whoSaidIt', presetLabel: 'WHO SAID IT?', title: 'Who Said It?', questions: [{ id: 'question-1', prompt: 'Who said this: “Add a quote here”?', options: ['Person A', 'Person B', 'Person C'], correctIndex: 0 }] } },
  { id: 'whichLesson', label: 'Which Lesson?', description: 'Connect a clue or idea to the correct lesson topic.', config: { preset: 'whichLesson', presetLabel: 'WHICH LESSON?', title: 'Which Lesson?', questions: [{ id: 'question-1', prompt: 'Which lesson does this idea belong to?', options: ['Lesson A', 'Lesson B', 'Lesson C'], correctIndex: 0 }] } },
  { id: 'recapRace', label: 'Recap Race', description: 'Turn a quick review into a fast run of teacher-authored questions.', config: { preset: 'recapRace', presetLabel: 'RECAP RACE', title: 'Recap Race', questions: [{ id: 'question-1', prompt: 'What is the most important idea from today?', options: ['Idea A', 'Idea B', 'Idea C'], correctIndex: 0 }, { id: 'question-2', prompt: 'Which example best illustrates it?', options: ['Example A', 'Example B', 'Example C'], correctIndex: 1 }] } },
  { id: 'keyWord', label: 'Key Word', description: 'Identify the key term that unlocks the teacher’s prompt.', config: { preset: 'keyWord', presetLabel: 'KEY WORD', title: 'Key Word', questions: [{ id: 'question-1', prompt: 'Which word best completes the idea?', options: ['Term A', 'Term B', 'Term C'], correctIndex: 1 }] } },
  { id: 'beforeOrAfter', label: 'Before or After', description: 'Place a fact, event, or idea on the correct side of a reference point.', config: { preset: 'beforeOrAfter', presetLabel: 'BEFORE OR AFTER', title: 'Before or After', questions: [{ id: 'question-1', prompt: 'Did this happen before or after the reference event?', options: ['Before', 'After', 'At the same time'], correctIndex: 0 }] } },
  { id: 'whichCameFirst', label: 'Which Came First?', description: 'Compare two items and choose the earlier one.', config: { preset: 'whichCameFirst', presetLabel: 'WHICH CAME FIRST?', title: 'Which Came First?', questions: [{ id: 'question-1', prompt: 'Which came first?', options: ['Item A', 'Item B'], correctIndex: 0 }] } },
  { id: 'overUnder', label: 'Over / Under', description: 'Make a quick estimate relative to a teacher-defined number.', config: { preset: 'overUnder', presetLabel: 'OVER / UNDER', title: 'Over / Under', questions: [{ id: 'question-1', prompt: 'Is the value over or under the reference number?', options: ['Over', 'Under', 'Exactly equal'], correctIndex: 0 }] } },
  { id: 'closestWithoutGoingOver', label: 'Closest Without Going Over', description: 'Choose the closest estimate that stays within the target.', config: { preset: 'closestWithoutGoingOver', presetLabel: 'CLOSEST WITHOUT GOING OVER', title: 'Closest Without Going Over', questions: [{ id: 'question-1', prompt: 'Which estimate is closest without going over?', options: ['Estimate A', 'Estimate B', 'Estimate C'], correctIndex: 1 }] } },
  { id: 'priceIsWrong', label: 'The Price Is Wrong', description: 'Use an intentionally surprising estimate as a lesson-friendly number game.', config: { preset: 'priceIsWrong', presetLabel: 'THE PRICE IS WRONG', title: 'The Price Is Wrong', questions: [{ id: 'question-1', prompt: 'Which estimate is closest to the real value?', options: ['Estimate A', 'Estimate B', 'Estimate C'], correctIndex: 1 }] } },
  { id: 'definitelyReal', label: 'Definitely Real', description: 'Separate the authentic fact from teacher-authored decoys.', config: { preset: 'definitelyReal', presetLabel: 'DEFINITELY REAL', title: 'Definitely Real', questions: [{ id: 'question-1', prompt: 'Which statement is definitely real?', options: ['Statement A', 'Statement B', 'Statement C'], correctIndex: 0 }] } },
  { id: 'thatCantBeRight', label: 'That Can’t Be Right', description: 'Spot the answer that breaks the rules of the topic.', config: { preset: 'thatCantBeRight', presetLabel: 'THAT CAN’T BE RIGHT', title: 'That Can’t Be Right', questions: [{ id: 'question-1', prompt: 'Which answer cannot be right?', options: ['Answer A', 'Answer B', 'Answer C'], correctIndex: 2 }] } }
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
    config: { preset: 'majorityRules', presetLabel: 'MAJORITY RULES', pollMode: 'majority', question: 'Which option do you think most people will choose?', options: ['Option A', 'Option B', 'Option C'], points: 100 }
  },
  {
    id: 'minorityReport',
    label: 'Minority Report',
    description: 'Invite the room to predict the least popular answer.',
    config: { preset: 'minorityReport', presetLabel: 'MINORITY REPORT', pollMode: 'minority', question: 'Which option will the fewest people choose?', options: ['Option A', 'Option B', 'Option C'], points: 100 }
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
  },
  { id: 'thisOrThatGauntlet', label: 'This or That Gauntlet', description: 'Run a sequence of quick two-choice decisions.', config: { preset: 'thisOrThatGauntlet', presetLabel: 'THIS OR THAT GAUNTLET', question: 'Which side wins this round?', options: ['This', 'That'] } },
  { id: 'consensus', label: 'Consensus', description: 'Find the option the room can agree on before revealing the distribution.', config: { preset: 'consensus', presetLabel: 'CONSENSUS', question: 'Which choice could the room agree to?', options: ['Option A', 'Option B', 'Option C'] } },
  { id: 'oneOfUs', label: 'One of Us', description: 'Use the group’s own names or roles as poll choices.', config: { preset: 'oneOfUs', presetLabel: 'ONE OF US', question: 'Who best fits this prompt?', options: ['Person A', 'Person B', 'Person C'] } },
  { id: 'knowYourGroup', label: 'Know Your Group', description: 'Ask a question that reveals how well the room knows itself.', config: { preset: 'knowYourGroup', presetLabel: 'KNOW YOUR GROUP', question: 'Which answer best describes this group?', options: ['Option A', 'Option B', 'Option C', 'Option D'] } },
  { id: 'yearbookAwards', label: 'Yearbook Awards', description: 'Let the room nominate a person or team for a playful award.', config: { preset: 'yearbookAwards', presetLabel: 'YEARBOOK AWARDS', question: 'Who wins this made-up award?', options: ['Person A', 'Person B', 'Person C'] } },
  { id: 'predictionMachine', label: 'Prediction Machine', description: 'Predict what the room will choose, then compare prediction to reality.', config: { preset: 'predictionMachine', presetLabel: 'PREDICTION MACHINE', pollMode: 'prediction', question: 'Which option will the room choose most often?', options: ['Option A', 'Option B', 'Option C'], points: 100 } },
  { id: 'tinyHillToDieOn', label: 'Tiny Hill to Die On', description: 'Take a harmless, strong position and see whether the room agrees.', config: { preset: 'tinyHillToDieOn', presetLabel: 'TINY HILL TO DIE ON', question: 'Which tiny opinion deserves your full support?', options: ['Option A', 'Option B', 'Option C'] } }
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
  },
  { id: 'secretCategory', label: 'Secret Category', description: 'Identify the hidden category from progressively clearer clues.', config: { preset: 'secretCategory', presetLabel: 'SECRET CATEGORY', title: 'Secret Category', clues: [{ id: 'clue-1', prompt: 'The first example belongs to the hidden category.', answer: 'Add the category', points: 300 }, { id: 'clue-2', prompt: 'A second example narrows the field.', answer: 'Add the category', points: 200 }, { id: 'clue-3', prompt: 'The final clue should make the category clear.', answer: 'Add the category', points: 100 }] } },
  { id: 'conceptPyramid', label: 'Concept Pyramid', description: 'Climb from a broad idea to the exact lesson concept.', config: { preset: 'conceptPyramid', presetLabel: 'CONCEPT PYRAMID', title: 'Concept Pyramid', clues: [{ id: 'clue-1', prompt: 'Start with a broad clue.', answer: 'Add the concept', points: 300 }, { id: 'clue-2', prompt: 'Narrow the idea with a useful detail.', answer: 'Add the concept', points: 200 }, { id: 'clue-3', prompt: 'Land on the key term.', answer: 'Add the concept', points: 100 }] } }
];

export const PUNCHLINE_PRESETS: ActivityPresetTemplate[] = [
  { id: 'punchline', label: 'Punchline', description: 'Finish a prompt with the funniest answer you can.', config: { preset: 'punchline', presetLabel: 'PUNCHLINE', title: 'Punchline', prompts: [{ id: 'prompt-1', prompt: 'The worst possible school mascot would be ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'captionThis', label: 'Caption This', description: 'Write a caption for a teacher-selected image or scene.', config: { preset: 'captionThis', presetLabel: 'CAPTION THIS', title: 'Caption This', prompts: [{ id: 'prompt-1', prompt: 'Write the caption this picture deserves.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'autocomplete', label: 'Autocomplete', description: 'Complete a sentence in the most surprising way.', config: { preset: 'autocomplete', presetLabel: 'AUTOCOMPLETE', title: 'Autocomplete', prompts: [{ id: 'prompt-1', prompt: 'I knew it was going to be a long day when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'badAdvice', label: 'Bad Advice', description: 'Give the least helpful answer to a very real problem.', config: { preset: 'badAdvice', presetLabel: 'BAD ADVICE', title: 'Bad Advice', prompts: [{ id: 'prompt-1', prompt: 'What is the worst advice for someone who forgot their homework?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'wrongAnswersOnly', label: 'Wrong Answers Only', description: 'Answer a simple prompt with a confidently incorrect response.', config: { preset: 'wrongAnswersOnly', presetLabel: 'WRONG ANSWERS ONLY', title: 'Wrong Answers Only', prompts: [{ id: 'prompt-1', prompt: 'What is this object definitely used for?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'sloganFactory', label: 'Slogan Factory', description: 'Invent a slogan for a team, idea, or imaginary product.', config: { preset: 'sloganFactory', presetLabel: 'SLOGAN FACTORY', title: 'Slogan Factory', prompts: [{ id: 'prompt-1', prompt: 'Create a slogan for a school that has one unusual rule.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'moviePitch', label: 'Movie Pitch', description: 'Pitch a movie from a short teacher-authored setup.', config: { preset: 'moviePitch', presetLabel: 'MOVIE PITCH', title: 'Movie Pitch', prompts: [{ id: 'prompt-1', prompt: 'Pitch a movie about a team that cannot agree on a name.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'makeItWorse', label: 'Make It Worse', description: 'Take an ordinary situation and escalate it creatively.', config: { preset: 'makeItWorse', presetLabel: 'MAKE IT WORSE', title: 'Make It Worse', prompts: [{ id: 'prompt-1', prompt: 'A normal group project becomes much worse when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'explainItBadly', label: 'Explain It Badly', description: 'Describe a familiar idea in the least helpful way possible.', config: { preset: 'explainItBadly', presetLabel: 'EXPLAIN IT BADLY', title: 'Explain It Badly', prompts: [{ id: 'prompt-1', prompt: 'Explain this everyday thing as badly as possible.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'renameIt', label: 'Rename It', description: 'Give an ordinary object, place, or idea a much better name.', config: { preset: 'renameIt', presetLabel: 'RENAME IT', title: 'Rename It', prompts: [{ id: 'prompt-1', prompt: 'Give this ordinary thing a new name.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'newProduct', label: 'New Product', description: 'Invent a product that solves a very specific problem.', config: { preset: 'newProduct', presetLabel: 'NEW PRODUCT', title: 'New Product', prompts: [{ id: 'prompt-1', prompt: 'Invent a product for a very specific problem.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'headline', label: 'Headline', description: 'Write the headline that would make everyone read the story.', config: { preset: 'headline', presetLabel: 'HEADLINE', title: 'Headline', prompts: [{ id: 'prompt-1', prompt: 'Write the headline for this unexpected event.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'deletedScene', label: 'Deleted Scene', description: 'Imagine the scene that was cut from the final story.', config: { preset: 'deletedScene', presetLabel: 'DELETED SCENE', title: 'Deleted Scene', prompts: [{ id: 'prompt-1', prompt: 'What happened in the deleted scene?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'alternateEnding', label: 'Alternate Ending', description: 'Rewrite the ending of a teacher-authored scenario.', config: { preset: 'alternateEnding', presetLabel: 'ALTERNATE ENDING', title: 'Alternate Ending', prompts: [{ id: 'prompt-1', prompt: 'Write a completely different ending.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'plotTwist', label: 'Plot Twist', description: 'Add the twist that changes everything at the last moment.', config: { preset: 'plotTwist', presetLabel: 'PLOT TWIST', title: 'Plot Twist', prompts: [{ id: 'prompt-1', prompt: 'The story changes when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'excuseGenerator', label: 'Excuse Generator', description: 'Create the most creative excuse for a harmless situation.', config: { preset: 'excuseGenerator', presetLabel: 'EXCUSE GENERATOR', title: 'Excuse Generator', prompts: [{ id: 'prompt-1', prompt: 'Give the most creative excuse for being five minutes late.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'superpowerCatch', label: 'Superpower / Catch', description: 'Invent a superpower with one inconvenient limitation.', config: { preset: 'superpowerCatch', presetLabel: 'SUPERPOWER / CATCH', title: 'Superpower / Catch', prompts: [{ id: 'prompt-1', prompt: 'Your superpower is ______, but the catch is ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'explainThisPhoto', label: 'Explain This Photo', description: 'Write the story behind a teacher-selected image.', config: { preset: 'explainThisPhoto', presetLabel: 'EXPLAIN THIS PHOTO', title: 'Explain This Photo', prompts: [{ id: 'prompt-1', prompt: 'What is really happening in this photo?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'whoApprovedThis', label: 'Who Approved This?', description: 'Explain how an obviously questionable idea got approved.', config: { preset: 'whoApprovedThis', presetLabel: 'WHO APPROVED THIS?', title: 'Who Approved This?', prompts: [{ id: 'prompt-1', prompt: 'Why did anyone approve this idea?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'worstRanking', label: 'Worst Ranking', description: 'Create the funniest ranking for a teacher-defined list.', config: { preset: 'worstRanking', presetLabel: 'WORST RANKING', title: 'Worst Ranking', prompts: [{ id: 'prompt-1', prompt: 'Give the worst possible ranking for this list.', points: 100 }], requireModeration: true, votingSeconds: 30 } }
];

export const FAKE_OUT_PRESETS: ActivityPresetTemplate[] = [
  { id: 'fakeOut', label: 'Fake Out', description: 'Find the real answer among believable bluffs.', config: { preset: 'fakeOut', presetLabel: 'FAKE OUT', title: 'Fake Out', rounds: [{ id: 'round-1', prompt: 'Which of these facts is true? Write a believable fake answer.', truth: 'Honey never spoils.', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whoWroteThat', label: 'Who Wrote That?', description: 'Guess which answer belongs to the teacher or target author.', config: { preset: 'whoWroteThat', presetLabel: 'WHO WROTE THAT?', title: 'Who Wrote That?', rounds: [{ id: 'round-1', prompt: 'Which answer was written by the mystery author?', truth: 'Add the real answer', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'confessions', label: 'Confessions', description: 'Separate the real confession from the invented stories.', config: { preset: 'confessions', presetLabel: 'CONFESSIONS', title: 'Confessions', rounds: [{ id: 'round-1', prompt: 'Which confession is real?', truth: 'Add the real confession', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'secretTalent', label: 'Secret Talent', description: 'Find the real talent hidden among decoys.', config: { preset: 'secretTalent', presetLabel: 'SECRET TALENT', title: 'Secret Talent', rounds: [{ id: 'round-1', prompt: 'Which secret talent belongs to the target player?', truth: 'Add the real talent', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whyIsThisHere', label: 'Why Is This Here?', description: 'Guess the true reason an object, image, or detail appears.', config: { preset: 'whyIsThisHere', presetLabel: 'WHY IS THIS HERE?', title: 'Why Is This Here?', rounds: [{ id: 'round-1', prompt: 'Why is this object in the scene?', truth: 'Add the real reason', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } }
];

export const DRAWING_PRESETS: ActivityPresetTemplate[] = [
  { id: 'doodle', label: 'Doodle', description: 'Draw a quick prompt and reveal the anonymous gallery.', config: { preset: 'doodle', presetLabel: 'DOODLE', title: 'Doodle', prompts: [{ id: 'prompt-1', prompt: 'Draw something surprising.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'drawAndVote', label: 'Draw & Vote', description: 'Let the room choose the drawing that best answers the prompt.', config: { preset: 'drawAndVote', presetLabel: 'DRAW & VOTE', title: 'Draw & Vote', prompts: [{ id: 'prompt-1', prompt: 'Draw the best symbol for teamwork.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'mascotMaker', label: 'Mascot Maker', description: 'Invent a mascot for a group, class, or team.', config: { preset: 'mascotMaker', presetLabel: 'MASCOT MAKER', title: 'Mascot Maker', prompts: [{ id: 'prompt-1', prompt: 'Design a mascot for a team that never gives up.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'logoDisaster', label: 'Logo Disaster', description: 'Create the worst logo for an ordinary idea.', config: { preset: 'logoDisaster', presetLabel: 'LOGO DISASTER', title: 'Logo Disaster', prompts: [{ id: 'prompt-1', prompt: 'Design a logo for the least organized club in school.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'inventionLab', label: 'Invention Lab', description: 'Sketch a new invention and let the room name its purpose.', config: { preset: 'inventionLab', presetLabel: 'INVENTION LAB', title: 'Invention Lab', prompts: [{ id: 'prompt-1', prompt: 'Draw an invention that solves a tiny everyday problem.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'drawTheDescription', label: 'Draw the Description', description: 'Turn a teacher-authored description into a visual guess.', config: { preset: 'drawTheDescription', presetLabel: 'DRAW THE DESCRIPTION', title: 'Draw the Description', prompts: [{ id: 'prompt-1', prompt: 'Draw a place where you would never want to lose your keys.', points: 100 }], requireModeration: true, votingSeconds: 30 } }
];

export const SURVEY_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'surveyShowdown',
    label: 'Survey Showdown',
    description: 'Reveal ranked answers with strikes, buzzers, and a team score.',
    config: { preset: 'surveyShowdown', presetLabel: 'SURVEY SHOWDOWN', title: 'Survey Showdown', teamPlay: true, stealEnabled: true, strikesToSteal: 3, questions: [{ id: 'question-1', prompt: 'Name something people bring to a group meeting.', answers: [{ id: 'answer-1', rank: 1, text: 'Notebook', points: 40 }, { id: 'answer-2', rank: 2, text: 'Drink', points: 30 }, { id: 'answer-3', rank: 3, text: 'Questions', points: 20 }, { id: 'answer-4', rank: 4, text: 'A friend', points: 10 }] }] }
  },
  {
    id: 'topFive',
    label: 'Top Five',
    description: 'Build a ranked board of five teacher-authored answers.',
    config: { preset: 'topFive', presetLabel: 'TOP FIVE', title: 'Top Five', questions: [{ id: 'question-1', prompt: 'What are five things that help a team succeed?', answers: [{ id: 'answer-1', rank: 1, text: 'Listen', points: 40 }, { id: 'answer-2', rank: 2, text: 'Practice', points: 30 }, { id: 'answer-3', rank: 3, text: 'Encourage', points: 20 }, { id: 'answer-4', rank: 4, text: 'Plan', points: 10 }, { id: 'answer-5', rank: 5, text: 'Celebrate', points: 5 }] }] }
  },
  {
    id: 'topAnswer',
    label: 'Top Answer',
    description: 'Put the biggest answer on the board and let teams hunt for it.',
    config: { preset: 'topAnswer', presetLabel: 'TOP ANSWER', title: 'Top Answer', questions: [{ id: 'question-1', prompt: 'What is the top answer to today’s question?', answers: [{ id: 'answer-1', rank: 1, text: 'Add the top answer', points: 100 }, { id: 'answer-2', rank: 2, text: 'Add another answer', points: 50 }, { id: 'answer-3', rank: 3, text: 'Add a third answer', points: 25 }] }] }
  },
  {
    id: 'bottomOfTheBarrel',
    label: 'Bottom of the Barrel',
    description: 'Make the lowest-ranked answer the surprising target.',
    config: { preset: 'bottomOfTheBarrel', presetLabel: 'BOTTOM OF THE BARREL', title: 'Bottom of the Barrel', questions: [{ id: 'question-1', prompt: 'What is the least expected answer to this question?', answers: [{ id: 'answer-1', rank: 1, text: 'Most common answer', points: 10 }, { id: 'answer-2', rank: 2, text: 'Less common answer', points: 25 }, { id: 'answer-3', rank: 3, text: 'Bottom-of-the-barrel answer', points: 50 }] }] }
  }
];

export const ORDERING_PRESETS: ActivityPresetTemplate[] = [
  { id: 'orderUp', label: 'Order Up', description: 'Arrange steps or ideas into the correct sequence.', config: { preset: 'orderUp', presetLabel: 'ORDER UP', title: 'Order Up', rounds: [{ id: 'round-1', prompt: 'Put these steps in the best order.', items: [{ id: 'item-1', label: 'Start' }, { id: 'item-2', label: 'Try' }, { id: 'item-3', label: 'Reflect' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'timeline', label: 'Timeline', description: 'Place events, discoveries, or milestones in chronological order.', config: { preset: 'timeline', presetLabel: 'TIMELINE', title: 'Timeline', rounds: [{ id: 'round-1', prompt: 'Put these events in chronological order.', items: [{ id: 'item-1', label: 'First event' }, { id: 'item-2', label: 'Second event' }, { id: 'item-3', label: 'Third event' }, { id: 'item-4', label: 'Fourth event' }], correctOrder: ['item-1', 'item-2', 'item-3', 'item-4'], points: 100 }] } },
  { id: 'rankIt', label: 'Rank It', description: 'Rank a set of choices against a teacher-defined standard.', config: { preset: 'rankIt', presetLabel: 'RANK IT', title: 'Rank It', rounds: [{ id: 'round-1', prompt: 'Rank these ideas from strongest to weakest.', items: [{ id: 'item-1', label: 'Strongest' }, { id: 'item-2', label: 'Middle' }, { id: 'item-3', label: 'Weakest' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'verseScramble', label: 'Verse Scramble', description: 'Reassemble a verse, quote, instruction, or key sentence.', config: { preset: 'verseScramble', presetLabel: 'VERSE SCRAMBLE', title: 'Verse Scramble', rounds: [{ id: 'round-1', prompt: 'Put the words or phrases back in the correct order.', items: [{ id: 'item-1', label: 'First phrase' }, { id: 'item-2', label: 'Next phrase' }, { id: 'item-3', label: 'Final phrase' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'missingStep', label: 'Missing Step', description: 'Order a process and identify what belongs before or after each step.', config: { preset: 'missingStep', presetLabel: 'MISSING STEP', title: 'Missing Step', rounds: [{ id: 'round-1', prompt: 'Place these process steps in order, then discuss what is missing.', items: [{ id: 'item-1', label: 'Prepare' }, { id: 'item-2', label: 'Act' }, { id: 'item-3', label: 'Review' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'causeAndEffect', label: 'Cause & Effect', description: 'Connect a chain of causes and outcomes by putting them in sequence.', config: { preset: 'causeAndEffect', presetLabel: 'CAUSE & EFFECT', title: 'Cause & Effect', rounds: [{ id: 'round-1', prompt: 'Put this cause-and-effect chain in the best order.', items: [{ id: 'item-1', label: 'Cause' }, { id: 'item-2', label: 'Change' }, { id: 'item-3', label: 'Effect' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'sortingHat', label: 'Sorting Hat', description: 'Sort a list by a teacher-defined priority or decision rule.', config: { preset: 'sortingHat', presetLabel: 'SORTING HAT', title: 'Sorting Hat', rounds: [{ id: 'round-1', prompt: 'Sort these choices from best fit to least fit.', items: [{ id: 'item-1', label: 'Best fit' }, { id: 'item-2', label: 'Possible fit' }, { id: 'item-3', label: 'Least fit' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'oddOneOut', label: 'Odd One Out', description: 'Place the odd item where the host-defined pattern makes it easiest to spot.', config: { preset: 'oddOneOut', presetLabel: 'ODD ONE OUT', title: 'Odd One Out', rounds: [{ id: 'round-1', prompt: 'Arrange these items, then explain which one breaks the pattern.', items: [{ id: 'item-1', label: 'Related item' }, { id: 'item-2', label: 'Related item' }, { id: 'item-3', label: 'Odd one out' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } }
];

export const WORD_PRESETS: ActivityPresetTemplate[] = [
  { id: 'categoryBlitz', label: 'Category Blitz', description: 'Submit as many approved answers as possible before time runs out.', config: { preset: 'categoryBlitz', presetLabel: 'CATEGORY BLITZ', title: 'Category Blitz', rounds: [{ id: 'round-1', prompt: 'Name as many things as you can that belong in this category.', category: 'Teacher category', points: 10, seconds: 45 }], requireModeration: true, allowDuplicates: false, maxWords: 30 } },
  { id: 'nameFive', label: 'Name Five', description: 'Race to contribute five answers to a focused prompt.', config: { preset: 'nameFive', presetLabel: 'NAME FIVE', title: 'Name Five', rounds: [{ id: 'round-1', prompt: 'Name five examples that fit the prompt.', category: 'Five things', points: 20, seconds: 45 }], requireModeration: true, allowDuplicates: false, maxWords: 5 } },
  { id: 'alphabetChallenge', label: 'Alphabet Challenge', description: 'Build a category list while working through the alphabet.', config: { preset: 'alphabetChallenge', presetLabel: 'ALPHABET CHALLENGE', title: 'Alphabet Challenge', rounds: [{ id: 'round-1', prompt: 'Submit one answer for as many letters as possible.', category: 'A–Z challenge', points: 15, seconds: 60 }], requireModeration: true, allowDuplicates: false, alphabetMode: true } },
  { id: 'lastOneStanding', label: 'Last One Standing', description: 'Keep the round moving with unique answers and a clear timeout.', config: { preset: 'lastOneStanding', presetLabel: 'LAST ONE STANDING', title: 'Last One Standing', rounds: [{ id: 'round-1', prompt: 'Give one unique answer before the round moves on.', category: 'Stay in the game', points: 25, seconds: 15 }], requireModeration: true, allowDuplicates: false, turnBased: true, eliminateOnDuplicate: true } },
  { id: 'chainReaction', label: 'Chain Reaction', description: 'Use the previous answer as inspiration for the next word.', config: { preset: 'chainReaction', presetLabel: 'CHAIN REACTION', title: 'Chain Reaction', rounds: [{ id: 'round-1', prompt: 'Submit a word connected to the previous answer.', category: 'Word chain', points: 15, seconds: 30 }], requireModeration: true, allowDuplicates: false, turnBased: true } },
  { id: 'wordAssociation', label: 'Word Association', description: 'Build a fast, teacher-guided stream of connected words.', config: { preset: 'wordAssociation', presetLabel: 'WORD ASSOCIATION', title: 'Word Association', rounds: [{ id: 'round-1', prompt: 'What word comes to mind first?', category: 'Association', points: 10, seconds: 30 }], requireModeration: true, allowDuplicates: false } },
  { id: 'wordStorm', label: 'Word Storm', description: 'Reveal repeated words at larger sizes in a shared room cloud.', config: { preset: 'wordStorm', presetLabel: 'WORD STORM', title: 'Word Storm', rounds: [{ id: 'round-1', prompt: 'Name something that helps a team work well.', category: 'Teamwork', points: 10, seconds: 45 }], requireModeration: true, allowDuplicates: false } },
  { id: 'oneWordTooFar', label: 'One Word Too Far', description: 'Find the answer that stretches the category past its safe boundary.', config: { preset: 'oneWordTooFar', presetLabel: 'ONE WORD TOO FAR', title: 'One Word Too Far', rounds: [{ id: 'round-1', prompt: 'Submit a word that almost fits, but goes one step too far.', category: 'Boundary test', points: 20, seconds: 30 }], requireModeration: true, allowDuplicates: false } }
];

export const MATCH_PRESETS: ActivityPresetTemplate[] = [
  { id: 'matchMinds', label: 'Match Minds', description: 'See who predicts the selected player’s private answer.', config: { preset: 'matchMinds', presetLabel: 'MATCH MINDS', title: 'Match Minds', rounds: [{ id: 'round-1', prompt: 'Which would you choose for a free afternoon?', options: ['Read', 'Explore', 'Create', 'Rest'], points: 100 }] } },
  { id: 'sameBrain', label: 'Same Brain', description: 'Find the players who think exactly like the target.', config: { preset: 'sameBrain', presetLabel: 'SAME BRAIN', title: 'Same Brain', rounds: [{ id: 'round-1', prompt: 'Which answer would the target choose?', options: ['Option A', 'Option B', 'Option C', 'Option D'], points: 100 }] } },
  { id: 'knowYourLeader', label: 'Know Your Leader', description: 'Let the group predict the leader’s answer and compare the room.', config: { preset: 'knowYourLeader', presetLabel: 'KNOW YOUR LEADER', title: 'Know Your Leader', rounds: [{ id: 'round-1', prompt: 'What will the leader choose?', options: ['Teach', 'Explore', 'Create', 'Rest'], points: 100 }] } },
  { id: 'friendMatch', label: 'Friend Match', description: 'Test how well friends predict one another’s choices.', config: { preset: 'friendMatch', presetLabel: 'FRIEND MATCH', title: 'Friend Match', rounds: [{ id: 'round-1', prompt: 'Which option would your friend pick?', options: ['Option A', 'Option B', 'Option C'], points: 100 }] } },
  { id: 'newlywedGame', label: 'Newlywed Game', description: 'Use paired players or teams for a lighthearted matching round.', config: { preset: 'newlywedGame', presetLabel: 'NEWLYWED GAME', title: 'Newlywed Game', rounds: [{ id: 'round-1', prompt: 'Which answer will your partner choose?', options: ['Early', 'On time', 'Late'], points: 100 }] } },
  { id: 'howWellDoYouKnowMe', label: 'How Well Do You Know Me?', description: 'Turn teacher-authored questions into a friendly prediction game.', config: { preset: 'howWellDoYouKnowMe', presetLabel: 'HOW WELL DO YOU KNOW ME?', title: 'How Well Do You Know Me?', rounds: [{ id: 'round-1', prompt: 'Which answer best describes the target?', options: ['Option A', 'Option B', 'Option C', 'Option D'], points: 100 }] } },
  { id: 'guessMyAnswer', label: 'Guess My Answer', description: 'Invite the room to predict a target player’s next answer.', config: { preset: 'guessMyAnswer', presetLabel: 'GUESS MY ANSWER', title: 'Guess My Answer', rounds: [{ id: 'round-1', prompt: 'What answer is the target about to choose?', options: ['Choice A', 'Choice B'], points: 100 }] } }
];

export const MEDIA_REVEAL_PRESETS: ActivityPresetTemplate[] = [
  { id: 'mysteryImage', label: 'Mystery Image', description: 'Reveal a teacher-selected image one stage at a time.', config: { preset: 'mysteryImage', presetLabel: 'MYSTERY IMAGE', title: 'Mystery Image', imageUrl: '', style: 'blur', totalStages: 5, prompt: 'Can you guess what it is?', answer: '' } },
  { id: 'zoomedIn', label: 'Zoomed In', description: 'Start close on a detail, then pull back to reveal the whole image.', config: { preset: 'zoomedIn', presetLabel: 'ZOOMED IN', title: 'Zoomed In', imageUrl: '', style: 'zoom', totalStages: 6, prompt: 'What are we looking at?', answer: '' } },
  { id: 'blurReveal', label: 'Blur Reveal', description: 'Use a clean progressive blur for photos, objects, or lesson visuals.', config: { preset: 'blurReveal', presetLabel: 'BLUR REVEAL', title: 'Blur Reveal', imageUrl: '', style: 'blur', totalStages: 8, prompt: 'What is hidden in the image?', answer: '' } },
  { id: 'silhouette', label: 'Silhouette', description: 'Turn the hidden image into a dramatic silhouette before the reveal.', config: { preset: 'silhouette', presetLabel: 'SILHOUETTE', title: 'Silhouette', imageUrl: '', style: 'silhouette', totalStages: 5, prompt: 'Who or what is this shape?', answer: '' } },
  { id: 'missingPiece', label: 'Missing Piece', description: 'Conceal the edges of an image and reveal more of the scene each step.', config: { preset: 'missingPiece', presetLabel: 'MISSING PIECE', title: 'Missing Piece', imageUrl: '', style: 'crop', totalStages: 6, prompt: 'What part of the scene is missing?', answer: '' } },
  { id: 'flashFrame', label: 'Flash Frame', description: 'Use a short reveal ladder for quick observation and memory rounds.', config: { preset: 'flashFrame', presetLabel: 'FLASH FRAME', title: 'Flash Frame', imageUrl: '', style: 'pixel', totalStages: 3, prompt: 'What detail did you notice?', answer: '' } },
  { id: 'picturePuzzler', label: 'Picture Puzzler', description: 'Pair a visual clue with a teacher-authored answer or lesson connection.', config: { preset: 'picturePuzzler', presetLabel: 'PICTURE PUZZLER', title: 'Picture Puzzler', imageUrl: '', style: 'pixel', totalStages: 7, prompt: 'What lesson idea does this picture represent?', answer: '' } },
  { id: 'freezeFrame', label: 'Freeze Frame', description: 'Reveal a paused visual gradually and ask what happens next.', config: { preset: 'freezeFrame', presetLabel: 'FREEZE FRAME', title: 'Freeze Frame', imageUrl: '', style: 'blur', totalStages: 5, prompt: 'What happens next?', answer: '' } }
];

export const STAGE_PRESETS: ActivityPresetTemplate[] = [
  { id: 'beatTheClock', label: 'Beat the Clock', description: 'Complete a host-led challenge before the timer runs out.', config: { preset: 'beatTheClock', presetLabel: 'BEAT THE CLOCK', title: 'Beat the Clock', challenges: [{ id: 'challenge-1', title: 'Build a paper tower', instructions: 'Build the tallest free-standing tower you can before the clock stops.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'minuteToWinIt', label: 'Minute to Win It', description: 'Turn a simple physical task into a quick, replayable contest.', config: { preset: 'minuteToWinIt', presetLabel: 'MINUTE TO WIN IT', title: 'Minute to Win It', challenges: [{ id: 'challenge-1', title: 'Move ten items using only a spoon', instructions: 'Move the items from one container to another before time expires.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'teachItBack', label: 'Teach It Back', description: 'Ask a contestant to explain a lesson idea clearly to the room.', config: { preset: 'teachItBack', presetLabel: 'TEACH IT BACK', title: 'Teach It Back', challenges: [{ id: 'challenge-1', title: 'Explain one idea in 30 seconds', instructions: 'Teach the room the key idea using an example anyone can understand.', seconds: 30, points: 100, failPoints: 0 }] } },
  { id: 'bestExplanation', label: 'Best Explanation', description: 'Compare explanations and let the host reward clarity and creativity.', config: { preset: 'bestExplanation', presetLabel: 'BEST EXPLANATION', title: 'Best Explanation', challenges: [{ id: 'challenge-1', title: 'Explain a tricky idea simply', instructions: 'Give the clearest explanation you can, then let the host make the ruling.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'scenarioJudge', label: 'Scenario Judge', description: 'Have a contestant respond to a teacher-authored real-world scenario.', config: { preset: 'scenarioJudge', presetLabel: 'SCENARIO JUDGE', title: 'Scenario Judge', challenges: [{ id: 'challenge-1', title: 'What would you do next?', instructions: 'Respond to the scenario and explain why your choice is responsible.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'exampleNonExample', label: 'Example / Non-Example', description: 'Classify and defend an example using the lesson’s criteria.', config: { preset: 'exampleNonExample', presetLabel: 'EXAMPLE / NON-EXAMPLE', title: 'Example / Non-Example', challenges: [{ id: 'challenge-1', title: 'Make the call', instructions: 'Decide whether the teacher’s example fits, then justify the decision.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'unnecessaryDebate', label: 'Unnecessary Debate', description: 'Make a playful argument for a low-stakes position.', config: { preset: 'unnecessaryDebate', presetLabel: 'UNNECESSARY DEBATE', title: 'Unnecessary Debate', challenges: [{ id: 'challenge-1', title: 'Defend your very strong opinion', instructions: 'Make the best case you can for a harmless, low-stakes position.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'courtroom', label: 'Courtroom', description: 'Present a short case and let the host rule on the argument.', config: { preset: 'courtroom', presetLabel: 'COURTROOM', title: 'Courtroom', challenges: [{ id: 'challenge-1', title: 'Make your case', instructions: 'Present evidence, respond to the prompt, and finish with a clear conclusion.', seconds: 90, points: 100, failPoints: 0 }] } },
  { id: 'sellMeThis', label: 'Sell Me This', description: 'Pitch an ordinary object as the answer to an unusual need.', config: { preset: 'sellMeThis', presetLabel: 'SELL ME THIS', title: 'Sell Me This', challenges: [{ id: 'challenge-1', title: 'Pitch this ordinary object', instructions: 'Give the room one compelling reason to want the object.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'poseMatch', label: 'Pose Match', description: 'Match a teacher or team pose under a visible time limit.', config: { preset: 'poseMatch', presetLabel: 'POSE MATCH', title: 'Pose Match', challenges: [{ id: 'challenge-1', title: 'Copy the pose', instructions: 'Match the host’s pose as closely as possible before the timer stops.', seconds: 30, points: 100, failPoints: 0 }] } },
  { id: 'photoHunt', label: 'Photo Hunt', description: 'Send a contestant or team to find a safe, teacher-defined visual example.', config: { preset: 'photoHunt', presetLabel: 'PHOTO HUNT', title: 'Photo Hunt', challenges: [{ id: 'challenge-1', title: 'Find the requested example', instructions: 'Find the teacher’s requested example and return before time expires.', seconds: 120, points: 100, failPoints: 0 }] } }
];
