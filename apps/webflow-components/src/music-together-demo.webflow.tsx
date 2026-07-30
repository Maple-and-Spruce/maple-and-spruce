/**
 * Webflow Code Component: Music Together Demo Classes
 *
 * Wraps the MusicTogetherDemoWidget for use in the Webflow Designer. A
 * direct-linkable, on-brand RSVP for FREE Music Together demo classes — the
 * widget loads the upcoming demos Stephanie created in the admin portal (each
 * with a date, location, and capacity) and the family picks one and gives us
 * their name + email. No payment; never touches Square.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { MusicTogetherDemoWidget } from './MusicTogetherDemoWidget';

export default declareComponent(MusicTogetherDemoWidget, {
  name: 'Music Together Demo Classes',
  description:
    'RSVP for a FREE Music Together demo class. The widget loads the upcoming demos created in the admin portal (date, location, capacity); families pick one and enter their name + email — no payment. RSVPs (confirmed + waitlist) are visible to admins for follow-up.',
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
  },
});
