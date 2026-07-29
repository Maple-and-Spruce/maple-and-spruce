/**
 * Webflow Code Component: Music Together Demo Classes
 *
 * Wraps the MusicTogetherDemoWidget for use in the Webflow Designer. A
 * direct-linkable, on-brand RSVP for FREE Music Together demo classes — the
 * family picks one of up to four configured demo time slots and gives us their
 * name + email. No payment; never touches Square.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { MusicTogetherDemoWidget } from './MusicTogetherDemoWidget';

export default declareComponent(MusicTogetherDemoWidget, {
  name: 'Music Together Demo Classes',
  description:
    'RSVP for a FREE Music Together demo class. Families pick one of the configured demo time slots and enter their name + email — no payment. RSVPs are visible to admins for follow-up.',
  decorators: [emotionShadowDomDecorator],
  props: {
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
    heading: props.Text({
      name: 'Heading',
      defaultValue: 'Free Demo Class',
    }),
    intro: props.Text({
      name: 'Intro',
      defaultValue:
        'Come make music with us — reserve a spot at a free demo class.',
    }),
    demoSlot1: props.Text({
      name: 'Demo slot 1',
      defaultValue: '',
    }),
    demoSlot2: props.Text({
      name: 'Demo slot 2',
      defaultValue: '',
    }),
    demoSlot3: props.Text({
      name: 'Demo slot 3',
      defaultValue: '',
    }),
    demoSlot4: props.Text({
      name: 'Demo slot 4',
      defaultValue: '',
    }),
  },
});
