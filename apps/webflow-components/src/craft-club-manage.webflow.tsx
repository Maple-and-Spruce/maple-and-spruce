/**
 * Webflow Code Component: Craft Club Manage
 *
 * Wraps the CraftClubManageWidget for the Webflow Designer. Place on the public
 * "manage my membership" page that the magic-link emails point to. The widget
 * reads the `?token=` query param itself; without one it shows the email form
 * to request a fresh link.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { CraftClubManageWidget } from './CraftClubManageWidget';

export default declareComponent(CraftClubManageWidget, {
  name: 'Craft Club Manage',
  description:
    'Self-service Craft Club membership management. Reads a ?token= magic link to show status, cancel, or change payment method; otherwise emails a fresh link.',
  decorators: [emotionShadowDomDecorator],
  props: {
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
  },
});
