/**
 * Webflow Code Component: Music Together Registration
 *
 * Wraps the MusicTogetherRegistrationWidget for use in the Webflow Designer.
 * Place one per section (Thursday / Saturday), each pointed at its own
 * Section ID. Payment routes to Music Together's own Square account, set via
 * the Square App ID / Location ID props (separate from Maple & Spruce's).
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { MusicTogetherRegistrationWidget } from './MusicTogetherRegistrationWidget';

export default declareComponent(MusicTogetherRegistrationWidget, {
  name: 'Music Together Registration',
  description:
    'Family enrollment + payment for a Music Together section. Collects parent/child details, offers pay-in-full or two installments (card-on-file), and shows a waitlist when full. Routes payment to MT’s Square account.',
  decorators: [emotionShadowDomDecorator],
  props: {
    sectionId: props.Text({
      name: 'Section ID',
      defaultValue: '',
    }),
    squareAppId: props.Text({
      name: 'Square App ID',
      defaultValue: '',
    }),
    squareLocationId: props.Text({
      name: 'Square Location ID',
      defaultValue: '',
    }),
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
    policiesUrl: props.Text({
      name: 'Policies URL',
      defaultValue: 'https://mapleandsprucefolkarts.com/music-together/policies',
    }),
  },
});
