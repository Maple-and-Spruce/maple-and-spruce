/**
 * Webflow Code Component: Gift Card (#300)
 *
 * Wraps the GiftCardWidget for use in the Webflow Designer. Put it on the
 * gift card page. To sell a class as a gift, link to that page with
 * `?giftClass=<classId>`, or set the Class ID prop on a page made for one
 * class. See docs/guides/gift-cards.md.
 */
import { declareComponent } from '@webflow/react';
import { props } from '@webflow/data-types';
import { emotionShadowDomDecorator } from '@webflow/emotion-utils';
import { GiftCardWidget } from './GiftCardWidget';

export default declareComponent(GiftCardWidget, {
  name: 'Gift Card',
  description:
    'Buy a Maple & Spruce gift card: a dollar amount or one class, emailed to the recipient or to the buyer to print. Pays with Square.',
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
    classId: props.Text({
      name: 'Class ID (optional)',
      defaultValue: '',
    }),
  },
});
