/**
 * Webflow Code Component: Music Together Manage Payment
 *
 * Wraps the MusicTogetherManageWidget for the Webflow Designer. Place on the
 * public "update my payment method" page that the magic-link emails point to.
 * The widget reads the `?token=` query param itself; without one it shows the
 * email form to request a fresh link.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { MusicTogetherManageWidget } from './MusicTogetherManageWidget';

export default declareComponent(MusicTogetherManageWidget, {
  name: 'Music Together Manage Payment',
  description:
    "Self-service Music Together card-on-file update. Reads a ?token= magic link to let an installment family enter a new card for the Week-5 charge; otherwise emails a fresh link.",
  decorators: [emotionShadowDomDecorator],
  props: {
    squareAppId: props.Text({
      name: 'Square App ID (Music Together)',
      defaultValue: '',
    }),
    squareLocationId: props.Text({
      name: 'Square Location ID (Music Together)',
      defaultValue: '',
    }),
    env: props.Variant({
      name: 'Environment',
      options: ['dev', 'prod'],
      defaultValue: 'prod',
    }),
  },
});
