/**
 * Webflow Code Component: Music Together Interest List
 *
 * Wraps the MusicTogetherInterestWidget for use in the Webflow Designer. Place
 * one anywhere on the Music Together site (e.g. a "waitlist / interest" page).
 * It loads the current section times, lets a family check the ones they'd take,
 * and captures preference / alternate-time / notes answers — no payment.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { MusicTogetherInterestWidget } from './MusicTogetherInterestWidget';

export default declareComponent(MusicTogetherInterestWidget, {
  name: 'Music Together Interest List',
  description:
    'Cross-section interest / waitlist form. Families check the section time(s) they’d join and answer preference + alternate-time + notes questions, so you can gauge demand and decide what class times to add. No payment.',
  decorators: [emotionShadowDomDecorator],
  props: {
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
    heading: props.Text({
      name: 'Heading',
      defaultValue: 'Join the Music Together interest list',
    }),
    intro: props.Text({
      name: 'Intro text',
      defaultValue:
        'Not sure which class time works, or nothing open right now? Tell us what you’re interested in and we’ll be in touch as spots and new sections open up.',
    }),
  },
});
